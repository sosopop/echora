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
 *   7. 若 onboarding 完成(name + level 齐全)→ yield state-transition('scene_selecting')
 *   8. yield done
 *
 * Provider 必须实现 chat();否则 yield error。
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import type { ProfileUpdateReq } from '../../shared/api.js';
import type { ChatMessage } from '../ai/types.js';
import {
  ensureProfile,
  upsertProfile,
  isOnboardingComplete,
} from '../services/profile.js';
import { getMessages } from '../services/message.js';
import {
  decidePromptMissingFields,
  buildSystemPrompt,
  updateProfileTool,
} from './_helpers/onboardingFsm.js';

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
    const profile = ensureProfile(ctx.db, ctx.user.id);
    const promptMissing = decidePromptMissingFields(profile);

    // 2. 必填项已齐 → 直接转场,不再调用 LLM
    if (isOnboardingComplete(profile)) {
      yield {
        type: 'text-chunk',
        payload: { text: '画像已采集完成,马上为你推荐合适的场景。' },
      };
      yield {
        type: 'state-transition',
        payload: { nextLearningState: 'scene_selecting', activeSkill: null },
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
    try {
      for await (const ev of ctx.provider.chat({
        system,
        messages,
        tools: [updateProfileTool],
        toolChoice: 'auto',
        maxTokens: 1024,
        signal: ctx.signal,
      })) {
        if (ctx.signal.aborted) break;
        if (ev.type === 'text-delta') {
          yield { type: 'text-chunk', payload: { text: ev.text } };
        } else if (ev.type === 'tool-use' && ev.toolName === 'update_profile') {
          collected = mergeProfileFields(collected, ev.input);
        }
      }
    } catch (err) {
      yield {
        type: 'error',
        payload: {
          code: 'SKILL_HANDLER_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
      return;
    }

    // 5. 落库
    if (Object.keys(collected).length > 0) {
      const updated = upsertProfile(ctx.db, ctx.user.id, collected);
      // 6. 是否完成
      if (isOnboardingComplete(updated)) {
        yield {
          type: 'state-transition',
          payload: { nextLearningState: 'scene_selecting', activeSkill: null },
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
