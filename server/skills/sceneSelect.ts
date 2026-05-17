/**
 * scene-select skill 真实实现(PRD §2.5)
 *
 * 两分支(由 ctx.params.action 决定):
 *   分支 1 · action='select-scene' → 用户选定候选 → LLM 生成完整 dialogue → 落库 → state-transition('practicing')
 *   分支 2 · 默认 或 action='request-new-scenes' → LLM 出候选池 → 系统筛 3-5 → widget scene-cards
 *
 * 候选池存内存:在分支 2 时把 candidates 落到 widget.data.cards,前端点击时
 * 通过 select-scene payload 回传 sceneId + 标题/描述/知识点/难度。旧客户端只传 sceneId
 * 时仍用 sceneId 构造最小 SceneCandidate 兼容。
 *
 * 这避免了「候选池存哪」的状态问题。
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import { ensureProfile } from '../services/profile.js';
import {
  appendSceneHistory,
  listSceneHistory,
} from '../services/sceneHistory.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import {
  runScenePropose,
  runDialogueGeneration,
  selectTopK,
  type SceneCandidate,
} from './_helpers/sceneSelectFsm.js';
import { updateConversationTitle } from '../services/conversation.js';
import type { ChatAction, CefrLevel } from '../../shared/api.js';
import { getDevErrorDetails } from '../utils/devError.js';
import { practiceSkill } from './practice.js';

const PROPOSE_COUNT = 20; // PRD §2.5 100 候选 → MVP 简化 20
const SHOW_COUNT = 5;

export const sceneSelectSkill: Skill = {
  name: SKILL_NAMES.sceneSelect,
  description: 'AI 生成候选场景 + 用户选定后生成场景对话(PRD §2.5)',
  allowedStates: ['scene_selecting', 'awaiting_next', 'reviewing', 'practicing'],
  primaryWidget: 'scene-cards',

  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const action = ctx.params.action as ChatAction | undefined;
    const profile = ensureProfile(ctx.db, ctx.user.id);

    /* ============================================================
     * 分支 1 · 用户选定场景 → 生成 dialogue
     * ========================================================== */
    if (action?.type === 'select-scene') {
      const sceneId = action.payload.sceneId;
      yield {
        type: 'text-chunk',
        payload: {
          text: `好的,正在准备「${action.payload.title ?? sceneId}」场景对话...`,
        },
      };
      const scene = actionPayloadToCandidate(
        action.payload,
        profile.level ?? 'B1'
      );
      try {
        const dialogue = await runDialogueGeneration(
          ctx.provider,
          profile,
          scene,
          ctx.signal
        );
        createSceneDialogue(ctx.db, {
          userId: ctx.user.id,
          conversationId: ctx.conversationId,
          sceneId: scene.id,
          title: scene.title,
          difficulty: scene.difficulty,
          roles: dialogue.roles,
          turns: dialogue.turns,
        });
        updateConversationTitle(ctx.db, ctx.conversationId, scene.title);
        appendSceneHistory(ctx.db, ctx.user.id, scene.topic);
      } catch (e) {
        const details = getDevErrorDetails(e);
        yield {
          type: 'error',
          payload: {
            code: 'SCENE_DIALOGUE_GEN_FAILED',
            message: e instanceof Error ? e.message : String(e),
            ...(details ? { details } : {}),
          },
        };
        return;
      }
      yield {
        type: 'text-chunk',
        payload: { text: `场景准备好了,开始练习「${scene.title}」。` },
      };
      for await (const ev of practiceSkill.handler({
        ...ctx,
        learningState: 'practicing',
        params: {},
      })) {
        yield ev;
      }
      return;
    }

    /* ============================================================
     * 分支 2 · 展示候选(默认 或 request-new-scenes)
     * ========================================================== */
    const used = listSceneHistory(ctx.db, ctx.user.id);
    yield {
      type: 'text-chunk',
      payload: { text: '我来根据你的画像准备几个场景。点击一张进入练习。' },
    };
    if (ctx.learningState === 'practicing') {
      yield {
        type: 'state-transition',
        payload: {
          nextLearningState: 'scene_selecting',
          activeSkill: 'scene-select',
        },
      };
    }
    yield { type: 'mode-switch', payload: { mode: 'select' } };
    const widgetId = ctx.makeWidgetId('scene-cards');
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'scene-cards',
          status: 'loading',
          data: {},
          version: 1,
        },
      },
    };
    let candidates: SceneCandidate[];
    try {
      candidates = await runScenePropose(
        ctx.provider,
        profile,
        used,
        PROPOSE_COUNT,
        ctx.signal
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const details = getDevErrorDetails(e);
      yield {
        type: 'text-chunk',
        payload: {
          text:
            '\n这次场景生成失败了。你可以重新生成场景,或者直接输入想练的主题。',
        },
      };
      yield {
        type: 'widget-ready',
        payload: {
          widgetId,
          patch: {
            status: 'error',
            data: {
              cards: [],
              allowCustom: true,
              errorCode: 'SCENE_PROPOSE_FAILED',
              message: '场景生成失败,请重新生成或直接输入想练的主题。',
            },
          },
        },
      };
      yield { type: 'mode-switch', payload: { mode: 'chat' } };
      yield {
        type: 'error',
        payload: {
          code: 'SCENE_PROPOSE_FAILED',
          message,
          ...(details ? { details } : {}),
        },
      };
      return;
    }
    const top = selectTopK(candidates, used, SHOW_COUNT, profile.level ?? 'B1');
    yield {
      type: 'widget-ready',
      payload: {
        widgetId,
        patch: {
          status: 'ready',
          data: {
            cards: top.map((s) => ({
              id: s.id,
              emoji: pickEmoji(s.topic),
              title: s.title,
              description: s.description,
              knowledgePoint: s.knowledgePoint,
              difficulty: s.difficulty,
            })),
            allowCustom: true,
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};

/**
 * select-scene payload → SceneCandidate。新客户端传完整卡片元数据;
 * 旧客户端只传 sceneId 时用 sceneId 构造兼容候选。
 */
function actionPayloadToCandidate(
  payload: Extract<ChatAction, { type: 'select-scene' }>['payload'],
  level: CefrLevel
): SceneCandidate {
  if (payload.title) {
    return {
      id: payload.sceneId,
      topic: payload.topic ?? payload.sceneId.replace(/-/g, ' '),
      title: payload.title,
      description: payload.description ?? `用户选择的场景:${payload.title}`,
      knowledgePoint: payload.knowledgePoint ?? '场景对话练习',
      difficulty: payload.difficulty ?? level,
    };
  }
  return sceneIdToCandidate(payload.sceneId, level);
}

function sceneIdToCandidate(sceneId: string, level: CefrLevel): SceneCandidate {
  const titleGuess = sceneId
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
  return {
    id: sceneId,
    topic: sceneId.replace(/-/g, ' '),
    title: titleGuess,
    description: `用户选择的场景:${sceneId}`,
    knowledgePoint: '场景对话练习',
    difficulty: level,
  };
}

const EMOJI_MAP: Record<string, string> = {
  restaurant: '🍝',
  school: '🏫',
  travel: '✈️',
  shop: '🛒',
  airport: '🛫',
  hospital: '🏥',
  job: '💼',
  party: '🎉',
};

function pickEmoji(topic: string): string {
  const lower = topic.toLowerCase();
  for (const [k, v] of Object.entries(EMOJI_MAP)) {
    if (lower.includes(k)) return v;
  }
  return '💬';
}
