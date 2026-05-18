/**
 * onboarding Skill — 真实实现
 *
 * 流程:
 *   1. 读 user_profiles(ensureProfile)
 *   2. 必填齐(isOnboardingComplete)→ 短路转场,不调 LLM
 *   3. decidePromptMissingFields → 给 prompt 用的「还需采集」措辞
 *   4. buildSystemPrompt → 拼装 system 提示
 *   5. provider.chat() 流式调用,monitor:
 *      - text-delta → yield text-chunk
 *      - tool-use(update_profile) → 累积到 collected
 *   6. 流结束后,若 collected 非空 → upsertProfile
 *   7. 若必填项仍缺 → 追加确定性下一步引导,避免工具调用后沉默
 *   8. 若 onboarding 完成(name + level 齐全)→ 转场并交给 scene-select 自动推荐场景
 *   9. yield done
 *
 * Provider 必须实现 chat();否则 yield error。
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import type { ProfileDTO, ProfileUpdateReq } from '../../shared/api.js';
import type { ChatMessage } from '../ai/types.js';
import { debugProviderChat } from '../ai/debugChat.js';
import {
  ensureProfile,
  upsertProfile,
  isOnboardingComplete,
} from '../services/profile.js';
import { getMessages } from '../services/message.js';
import { sceneSelectSkill } from './sceneSelect.js';
import {
  decideMissingRequired,
  decidePromptMissingFields,
  buildSystemPrompt,
  updateProfileTool,
  type OnboardingField,
} from './_helpers/onboardingFsm.js';
import {
  resolveExpectedInputRefusal,
  shouldAppendExpectedInputPrompt,
  type ExpectedInputPolicy,
} from './_helpers/interactionPolicy.js';

const TEMPORARY_NAME = '小伙伴';

const ONBOARDING_INPUT_POLICIES: Record<
  OnboardingField,
  ExpectedInputPolicy<OnboardingField, ProfileUpdateReq>
> = {
  name: {
    field: 'name',
    label: '称呼',
    required: true,
    prompt: '接下来先告诉我怎么称呼你,随便一个昵称就行。',
    recovery: {
      kind: 'fallback',
      value: { name: TEMPORARY_NAME },
      reason: '称呼是必填画像字段,但拒绝提供时可以用临时称呼继续推进。',
    },
    refusalPatterns: [
      /不告诉|不想说|不说|先不说|暂时不说|不方便说|保密|匿名/,
      /随便叫|你决定|你看着叫|叫啥都行|叫什么都行|都可以/,
    ],
    promptedPatterns: [/称呼|怎么叫|叫你|昵称|名字/],
  },
  level: {
    field: 'level',
    label: '英语水平',
    required: true,
    prompt:
      '英语水平是开始练习前必须确认的信息,我不能替你随便猜。你可以选最接近的:A1/A2/B1/B2/C1/C2,或者说“初学”“四级左右”“能流畅交流”。',
    recovery: {
      kind: 'retry',
      reason: '英语水平会决定场景和题目难度,不能跳过,也不能由 AI 兜底猜测。',
    },
    refusalPatterns: [
      /不知道|不清楚|不确定|不会评估|不好说/,
      /不告诉|不想说|不说|先不说|暂时不说|不方便说|保密/,
      /随便|你决定|你看着办|你来定|都可以/,
    ],
    promptedPatterns: [
      /英语水平|水平|阶段|基础|零基础|初学|流利|四级|六级|雅思|A1|A2|B1|B2|C1|C2|线索|难度/,
    ],
  },
  grade: {
    field: 'grade',
    label: '年级',
    required: false,
    prompt: '你现在是几年级,或者在读/在职的阶段是什么?不想说也可以跳过。',
    recovery: {
      kind: 'skip',
      reason: '年级只用于个性化话题,不是推进 onboarding 的必要条件。',
    },
    refusalPatterns: [/不告诉|不想说|不说|跳过|暂时不说|不方便说|保密/],
    promptedPatterns: [/年级|在读|在职|阶段|学校|工作/],
  },
  age: {
    field: 'age',
    label: '年龄',
    required: false,
    prompt: '年龄不是必填项,你愿意说我就记录,不愿意也可以直接跳过。',
    recovery: {
      kind: 'skip',
      reason: '年龄只在用户主动提供时记录,不阻塞任何工作流。',
    },
    refusalPatterns: [/不告诉|不想说|不说|跳过|暂时不说|不方便说|保密/],
    promptedPatterns: [/年龄|几岁/],
  },
};

export const onboardingSkill: Skill = {
  name: SKILL_NAMES.onboarding,
  description: '对话式收集用户画像(姓名 / 年级 / 英语水平)',
  allowedStates: ['onboarding'],

  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;

    if (!ctx.provider.chat) {
      yield {
        type: 'error',
        payload: {
          code: 'PROVIDER_CHAT_UNAVAILABLE',
          message:
            '当前 AI Provider 不支持 chat 接口,无法运行 onboarding。请将 AI_PROVIDER 设为 anthropic 并配置 ANTHROPIC_API_KEY。',
        },
      };
      return;
    }

    // 1. 读画像与缺失字段
    let profile = ensureProfile(ctx.db, ctx.user.id);
    const userText = readCurrentUserText(ctx);
    const refusalResolution = resolveOnboardingRefusal(profile, userText);
    if (refusalResolution?.kind === 'fallback') {
      profile = upsertProfile(ctx.db, ctx.user.id, refusalResolution.value);
    } else if (refusalResolution?.kind === 'retry') {
      yield { type: 'text-chunk', payload: { text: refusalResolution.prompt } };
      yield { type: 'done', payload: {} };
      return;
    } else if (refusalResolution?.kind === 'fail') {
      yield {
        type: 'error',
        payload: {
          code: refusalResolution.code,
          message: refusalResolution.message,
        },
      };
      return;
    }
    const promptMissing = decidePromptMissingFields(profile);

    // 2. 必填项已齐 → 直接进入场景推荐,不再调用 onboarding LLM
    if (isOnboardingComplete(profile)) {
      yield {
        type: 'text-chunk',
        payload: { text: '画像已采集完成,马上为你推荐合适的场景。' },
      };
      yield* continueToSceneSelection(ctx);
      return;
    }

    if (ctx.provider.name === 'stub') {
      yield {
        type: 'text-chunk',
        payload: { text: buildStubOnboardingReply(promptMissing) },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    // 3. 拼 system + 历史消息
    const system = buildSystemPrompt(profile, promptMissing);
    const history = getMessages(ctx.db, ctx.conversationId)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map<ChatMessage>((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content ?? '',
      }))
      .filter((m) => m.content.trim().length > 0);

    // 若无历史(首条),fabricate 一条 user kickoff
    const messages: ChatMessage[] =
      history.length > 0 ? history : [{ role: 'user', content: 'hi' }];

    // 4. 流式调用
    let collected: ProfileUpdateReq = {};
    let emittedText = '';
    try {
      for await (const ev of debugProviderChat(
        ctx.provider,
        {
          system,
          messages,
          tools: [updateProfileTool],
          toolChoice: 'auto',
          maxTokens: 1024,
          signal: ctx.signal,
        },
        ctx.logDebug,
        {
          traceId: ctx.traceId,
          userId: ctx.user.id,
          conversationId: ctx.conversationId,
          messageId: ctx.messageId,
          streamId: ctx.streamId,
          runId: ctx.runId,
          skillName: SKILL_NAMES.onboarding,
          learningState: ctx.learningState,
          phase: 'onboarding',
        }
      )) {
        if (ctx.signal.aborted) break;
        if (ev.type === 'text-delta') {
          emittedText += ev.text;
          yield { type: 'text-chunk', payload: { text: ev.text } };
        } else if (ev.type === 'tool-use' && ev.toolName === 'update_profile') {
          collected = mergeProfileFields(collected, ev.input);
        }
      }
    } catch (err) {
      if (ctx.signal.aborted || isAbortError(err)) {
        return;
      }
      yield {
        type: 'error',
        payload: {
          code: 'SKILL_HANDLER_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
      return;
    }
    if (ctx.signal.aborted) return;

    // 5. 落库
    if (Object.keys(collected).length > 0) {
      const updated = upsertProfile(ctx.db, ctx.user.id, collected);
      // 6. 是否完成
      if (isOnboardingComplete(updated)) {
        yield {
          type: 'text-chunk',
          payload: {
            text: appendGuidance(
              emittedText,
              '画像够用了,我现在给你推荐几个适合练习的场景。'
            ),
          },
        };
        yield* continueToSceneSelection(ctx);
        return;
      }

      const nextPrompt = buildRequiredFieldPrompt(updated);
      if (
        nextPrompt &&
        shouldAppendExpectedInputPrompt(nextPrompt.policy, emittedText)
      ) {
        yield {
          type: 'text-chunk',
          payload: { text: appendGuidance(emittedText, nextPrompt.text) },
        };
      }
    } else {
      const fallbackPrompt = buildRequiredFieldPrompt(profile);
      if (
        fallbackPrompt &&
        shouldAppendExpectedInputPrompt(fallbackPrompt.policy, emittedText)
      ) {
        yield {
          type: 'text-chunk',
          payload: { text: appendGuidance(emittedText, fallbackPrompt.text) },
        };
      }
    }

    yield { type: 'done', payload: {} };
  },
};

/**
 * 把 LLM tool input 清洗合并到 collected:
 *   - 字段类型守卫
 *   - level enum 校验
 *   - 字符串 trim
 */
function mergeProfileFields(
  prev: ProfileUpdateReq,
  raw: Record<string, unknown>
): ProfileUpdateReq {
  const next: ProfileUpdateReq = { ...prev };
  if (typeof raw.name === 'string' && raw.name.trim()) {
    next.name = raw.name.trim();
  }
  if (typeof raw.age === 'number' && Number.isInteger(raw.age) && raw.age > 0) {
    next.age = raw.age;
  }
  if (typeof raw.grade === 'string' && raw.grade.trim()) {
    next.grade = raw.grade.trim();
  }
  if (
    typeof raw.level === 'string' &&
    ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(raw.level)
  ) {
    next.level = raw.level as ProfileUpdateReq['level'];
  }
  return next;
}

async function* continueToSceneSelection(
  ctx: ServerSkillContext
): AsyncIterable<SkillEventInput> {
  yield {
    type: 'state-transition',
    payload: { nextLearningState: 'scene_selecting', activeSkill: 'scene-select' },
  };

  for await (const ev of sceneSelectSkill.handler({
    ...ctx,
    learningState: 'scene_selecting',
    params: { action: { type: 'request-new-scenes' } },
  })) {
    yield ev;
  }
}

interface RequiredFieldPrompt {
  field: OnboardingField;
  text: string;
  policy: ExpectedInputPolicy<OnboardingField, ProfileUpdateReq>;
}

function buildRequiredFieldPrompt(profile: ProfileDTO): RequiredFieldPrompt | null {
  const missing = decideMissingRequired(profile);
  const next = missing[0];
  if (!next) return null;
  const policy = ONBOARDING_INPUT_POLICIES[next];
  return { field: next, text: policy.prompt, policy };
}

function appendGuidance(previousText: string, guidance: string): string {
  return previousText.trim() ? `\n\n${guidance}` : guidance;
}

function readCurrentUserText(ctx: ServerSkillContext): string {
  const value = ctx.params.userText;
  return typeof value === 'string' ? value.trim() : '';
}

function resolveOnboardingRefusal(profile: ProfileDTO, userText: string) {
  const missing = decideMissingRequired(profile);
  const nextRequired = missing[0];
  if (!nextRequired) return null;
  return resolveExpectedInputRefusal(
    ONBOARDING_INPUT_POLICIES[nextRequired],
    userText
  );
}

function buildStubOnboardingReply(
  missing: ReturnType<typeof decidePromptMissingFields>
): string {
  const next = missing[0];
  if (next === 'name') {
    return '在的，我是 Echo。先告诉我怎么称呼你吧。';
  }
  if (next === 'grade') {
    return '收到。你现在是几年级，或者在读/在职的阶段是什么？不想说也可以跳过。';
  }
  if (next === 'level') {
    return '最后确认一下你的英语水平：A1/A2/B1/B2/C1/C2，或者直接说“初学”“四级左右”“能流畅交流”也行。';
  }
  return '画像信息已经够用了，我准备给你推荐合适的练习场景。';
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
