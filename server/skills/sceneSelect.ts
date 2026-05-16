/**
 * scene-select skill 真实实现(PRD §2.5)
 *
 * 两分支(由 ctx.params.action 决定):
 *   分支 1 · action='select-scene' → 用户选定候选 → LLM 生成完整 dialogue → 落库 → state-transition('practicing')
 *   分支 2 · 默认 或 action='request-new-scenes' → LLM 出候选池 → 系统筛 3-5 → widget scene-cards
 *
 * 候选池存内存:在分支 2 时把 candidates 落到 widget.data.cards,前端把 sceneId 回传时
 * 后端在分支 1 重新查不到——所以分支 1 必须自带候选信息。**协议**:select-scene 的
 * payload 只传 sceneId,后端用该 id 现重新调一次 propose 拿候选并选定对应一项(简化:
 * 重生成 + 选 id 命中)。MVP 简化:select-scene 直接构造一个轻量 scene 对象(title=sceneId
 * 转空格 + 首字母大写,description="用户选择的场景",difficulty 用 profile.level),让
 * LLM dialogue 生成时基于 sceneId 推断场景细节。
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
import type { ChatAction, CefrLevel } from '../../shared/api.js';

const PROPOSE_COUNT = 20; // PRD §2.5 100 候选 → MVP 简化 20
const SHOW_COUNT = 5;

export const sceneSelectSkill: Skill = {
  name: SKILL_NAMES.sceneSelect,
  description: 'AI 生成候选场景 + 用户选定后生成场景对话(PRD §2.5)',
  allowedStates: ['scene_selecting', 'awaiting_next', 'reviewing'],
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
        payload: { text: `好的,正在准备「${sceneId}」场景对话...` },
      };
      // 由 sceneId 构造最小 SceneCandidate(由 LLM 在 prompt 中扩展场景细节)
      const scene = sceneIdToCandidate(sceneId, profile.level ?? 'B1');
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
        appendSceneHistory(ctx.db, ctx.user.id, scene.topic);
      } catch (e) {
        yield {
          type: 'error',
          payload: {
            code: 'SCENE_DIALOGUE_GEN_FAILED',
            message: e instanceof Error ? e.message : String(e),
          },
        };
        return;
      }
      yield {
        type: 'text-chunk',
        payload: { text: `场景准备好了,开始练习「${scene.title}」。` },
      };
      yield {
        type: 'state-transition',
        payload: { nextLearningState: 'practicing', activeSkill: 'practice' },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    /* ============================================================
     * 分支 2 · 展示候选(默认 或 request-new-scenes)
     * ========================================================== */
    const used = listSceneHistory(ctx.db, ctx.user.id);
    yield {
      type: 'text-chunk',
      payload: { text: '根据你的画像,我挑了几个场景。点击一张进入练习。' },
    };
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
      yield {
        type: 'error',
        payload: {
          code: 'SCENE_PROPOSE_FAILED',
          message: e instanceof Error ? e.message : String(e),
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
 * sceneId → 最小 SceneCandidate,用于 LLM dialogue 生成时的 prompt 起点。
 * LLM 会基于 sceneId 自行扩展场景细节(title/description 是 prompt 引导,不强约束)。
 */
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
