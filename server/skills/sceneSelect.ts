/**
 * scene-select skill 真实实现(PRD §2.5)
 *
 * 三分支(由 ctx.params 决定):
 *   分支 1 · action='select-scene' → 用户选定候选 → LLM 生成完整 dialogue → 落库 → state-transition('practicing')
 *   分支 2 · customSceneText / scene / userInput → 用户自由输入主题 → 直接生成 dialogue
 *   分支 3 · 默认 或 action='request-new-scenes' → LLM 出候选池 → 系统筛 8 + 自定义入口 → widget scene-cards
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
import {
  ensureProfile,
  type DifficultyAdjustmentResult,
} from '../services/profile.js';
import {
  appendSceneHistory,
  listSceneHistory,
} from '../services/sceneHistory.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import {
  runScenePropose,
  runDialogueGeneration,
  selectTopK,
  normalizeSceneTopic,
  type SceneCandidate,
} from './_helpers/sceneSelectFsm.js';
import { updateConversationTitle } from '../services/conversation.js';
import type { ChatAction, CefrLevel, ProfileDTO } from '../../shared/api.js';
import { getDevErrorDetails } from '../utils/devError.js';
import { practiceSkill } from './practice.js';

const PROPOSE_COUNT = 20; // PRD §2.5 100 候选 → MVP 简化 20
const SHOW_COUNT = 8;

export const sceneSelectSkill: Skill = {
  name: SKILL_NAMES.sceneSelect,
  description: 'AI 生成候选场景 + 用户选定后生成场景对话(PRD §2.5)',
  allowedStates: ['scene_selecting', 'awaiting_next', 'reviewing', 'practicing'],
  primaryWidget: 'scene-cards',

  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const action = ctx.params.action as ChatAction | undefined;
    const difficultyFeedback = ctx.params
      .difficultyFeedback as DifficultyAdjustmentResult | undefined;
    const profile = ensureProfile(ctx.db, ctx.user.id);

    if (action?.type === 'select-scene') {
      const sceneId = action.payload.sceneId;
      const scene = actionPayloadToCandidate(
        action.payload,
        profile.level ?? 'B1'
      );
      yield* startSelectedScene(
        ctx,
        profile,
        scene,
        `好的,正在准备「${action.payload.title ?? sceneId}」场景对话...`
      );
      return;
    }

    const customSceneText = readCustomSceneText(ctx.params);
    if (customSceneText) {
      const scene = customSceneTextToCandidate(
        customSceneText,
        profile.level ?? 'B1'
      );
      yield* startSelectedScene(
        ctx,
        profile,
        scene,
        `好的,就练「${scene.title}」。我来准备场景对话...`
      );
      return;
    }

    /* ============================================================
     * 分支 2 · 展示候选(默认 或 request-new-scenes)
     * ========================================================== */
    const used = listSceneHistory(ctx.db, ctx.user.id);
    yield {
      type: 'text-chunk',
      payload: {
        text:
          formatDifficultyFeedback(difficultyFeedback) +
          '我来根据你的画像准备 8 个场景。点一张进入练习，或者直接选自定义告诉我你想练什么。',
      },
    };
    if (ctx.learningState !== 'scene_selecting') {
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
        ctx.signal,
        ctx.logDebug,
        {
          traceId: ctx.traceId,
          userId: ctx.user.id,
          conversationId: ctx.conversationId,
          messageId: ctx.messageId,
          streamId: ctx.streamId,
          runId: ctx.runId,
          skillName: SKILL_NAMES.sceneSelect,
          learningState: ctx.learningState,
          phase: 'scene-propose',
        }
      );
    } catch (e) {
      if (ctx.signal.aborted || isAbortError(e)) {
        return;
      }
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
    const cards = buildSceneCards(top, used, profile.level ?? 'B1');
    yield {
      type: 'widget-ready',
      payload: {
        widgetId,
        patch: {
          status: 'ready',
          data: {
            cards,
            allowCustom: true,
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};

async function* startSelectedScene(
  ctx: ServerSkillContext,
  profile: ProfileDTO,
  scene: SceneCandidate,
  introText: string
): AsyncIterable<SkillEventInput> {
  yield {
    type: 'text-chunk',
    payload: { text: introText },
  };
  try {
    const dialogue = await runDialogueGeneration(
      ctx.provider,
      profile,
      scene,
      ctx.signal,
      ctx.logDebug,
      {
        traceId: ctx.traceId,
        userId: ctx.user.id,
        conversationId: ctx.conversationId,
        messageId: ctx.messageId,
        streamId: ctx.streamId,
        runId: ctx.runId,
        skillName: SKILL_NAMES.sceneSelect,
        learningState: ctx.learningState,
        phase: 'scene-dialogue',
      }
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
    if (ctx.signal.aborted || isAbortError(e)) {
      return;
    }
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
    payload: {
      text: `场景准备好了,开始练习「${scene.title}」。`,
    },
  };
  for await (const ev of practiceSkill.handler({
    ...ctx,
    learningState: 'practicing',
    params: {},
  })) {
    yield ev;
  }
}

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

function readCustomSceneText(params: Record<string, unknown>): string | null {
  const value =
    typeof params.customSceneText === 'string'
      ? params.customSceneText
      : typeof params.scene === 'string'
      ? params.scene
      : typeof params.userInput === 'string'
      ? params.userInput
      : null;
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}

function customSceneTextToCandidate(
  text: string,
  level: CefrLevel
): SceneCandidate {
  return {
    id: `custom-${hashSceneText(text)}`,
    topic: text,
    title: text.length > 18 ? `${text.slice(0, 18)}...` : text,
    description: `围绕「${text}」进行真实英语对话练习。`,
    knowledgePoint: '真实场景表达',
    difficulty: level,
  };
}

function hashSceneText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

type SceneCardView = SceneCandidate & { emoji: string };

const SCENE_EMOJI_CATEGORIES: Array<{
  keywords: string[];
  emojis: string[];
}> = [
  { keywords: ['restaurant', 'food', 'dining', 'order', 'meal', 'cafe', 'coffee'], emojis: ['🍽️', '🍝', '☕', '🍜'] },
  { keywords: ['school', 'class', 'study', 'library', 'campus', 'homework', 'teacher'], emojis: ['🏫', '📚', '🎒', '📝'] },
  { keywords: ['travel', 'trip', 'journey', 'direction', 'map', 'tour', 'tourist'], emojis: ['✈️', '🧭', '🗺️', '🚇'] },
  { keywords: ['shop', 'shopping', 'store', 'market', 'mall', 'price', 'bargain'], emojis: ['🛍️', '🛒', '🏷️', '💳'] },
  { keywords: ['airport', 'flight', 'boarding', 'luggage', 'check-in'], emojis: ['🛫', '🧳', '🎫', '🛬'] },
  { keywords: ['hospital', 'doctor', 'clinic', 'pharmacy', 'health', 'medicine'], emojis: ['🏥', '🩺', '💊', '🚑'] },
  { keywords: ['job', 'work', 'office', 'meeting', 'interview', 'career', 'boss'], emojis: ['💼', '🧑‍💼', '🤝', '🗂️'] },
  { keywords: ['party', 'celebration', 'birthday', 'friend', 'social', 'invitation', 'event'], emojis: ['🎉', '🥳', '🎈', '🤝'] },
  { keywords: ['hotel', 'room', 'reservation', 'reception', 'checkin'], emojis: ['🏨', '🛎️', '🛏️', '🧳'] },
  { keywords: ['phone', 'call', 'support', 'tech', 'app', 'internet', 'service'], emojis: ['📱', '☎️', '🛠️', '💬'] },
  { keywords: ['home', 'family', 'daily', 'house', 'kitchen', 'chores'], emojis: ['🏠', '🍳', '🧺', '🪴'] },
  { keywords: ['cinema', 'movie', 'film', 'concert', 'music', 'show'], emojis: ['🎬', '🍿', '🎵', '🎟️'] },
  { keywords: ['sport', 'game', 'gym', 'fitness', 'run', 'exercise'], emojis: ['⚽', '🏃', '🏋️', '🥇'] },
  { keywords: ['bank', 'money', 'atm', 'finance', 'payment'], emojis: ['🏦', '💰', '🪙', '💳'] },
  { keywords: ['weather', 'rain', 'snow', 'sunny', 'forecast'], emojis: ['🌦️', '☀️', '🌧️', '⛅'] },
];

const FALLBACK_SCENE_TEMPLATES: Omit<SceneCandidate, 'difficulty'>[] = [
  {
    id: 'cafe-ordering',
    topic: 'cafe ordering',
    title: '咖啡点单',
    description: '点饮品、加料、打包带走。',
    knowledgePoint: '礼貌请求',
  },
  {
    id: 'hotel-checkin',
    topic: 'hotel check-in',
    title: '酒店入住',
    description: '办理入住、确认房型和早餐。',
    knowledgePoint: '基础问答',
  },
  {
    id: 'library-borrowing',
    topic: 'library borrowing',
    title: '图书借阅',
    description: '借书、续借、询问归还时间。',
    knowledgePoint: '询问信息',
  },
  {
    id: 'bank-payment',
    topic: 'bank payment',
    title: '银行业务',
    description: '存取款、转账和确认手续费。',
    knowledgePoint: '数字表达',
  },
  {
    id: 'doctor-visit',
    topic: 'doctor visit',
    title: '看病问诊',
    description: '描述症状、预约时间、拿药。',
    knowledgePoint: '身体状况表达',
  },
  {
    id: 'movie-plan',
    topic: 'movie plan',
    title: '看电影约票',
    description: '约朋友、选场次、讨论片名。',
    knowledgePoint: '邀请表达',
  },
  {
    id: 'office-meeting',
    topic: 'office meeting',
    title: '办公室会议',
    description: '讨论安排、确认任务和时间。',
    knowledgePoint: '工作协作',
  },
  {
    id: 'gym-signup',
    topic: 'gym signup',
    title: '健身办卡',
    description: '了解课程、费用和预约规则。',
    knowledgePoint: '咨询与确认',
  },
  {
    id: 'taxi-ride',
    topic: 'taxi ride',
    title: '打车出行',
    description: '告诉司机目的地、路线和付款。',
    knowledgePoint: '方向表达',
  },
  {
    id: 'weather-plan',
    topic: 'weather plan',
    title: '天气出行',
    description: '根据天气讨论带伞、改行程。',
    knowledgePoint: '条件表达',
  },
  {
    id: 'pet-care',
    topic: 'pet care',
    title: '宠物照看',
    description: '喂食、遛宠物和安排寄养。',
    knowledgePoint: '日常安排',
  },
  {
    id: 'friend-invitation',
    topic: 'friend invitation',
    title: '朋友邀约',
    description: '约见面、改时间和确认地点。',
    knowledgePoint: '社交邀请',
  },
];

const SYNTHETIC_SCENE_TEMPLATES: Array<
  Omit<SceneCandidate, 'id' | 'topic' | 'difficulty'>
> = [
  {
    title: '日常采购',
    description: '买日用品、问价格和确认数量。',
    knowledgePoint: '基础问句',
  },
  {
    title: '路线问询',
    description: '问地铁、公交和步行方向。',
    knowledgePoint: '方向表达',
  },
  {
    title: '快递取件',
    description: '核对姓名、号码和取件流程。',
    knowledgePoint: '信息确认',
  },
  {
    title: '课堂交流',
    description: '借东西、请假、问作业。',
    knowledgePoint: '礼貌请求',
  },
  {
    title: '晚餐安排',
    description: '决定吃什么、谁来订位。',
    knowledgePoint: '建议表达',
  },
  {
    title: '周末计划',
    description: '讨论周末去哪儿、怎么去。',
    knowledgePoint: '计划表达',
  },
];

function buildSceneCards(
  selected: SceneCandidate[],
  usedTopics: string[],
  preferredLevel: CefrLevel
): SceneCardView[] {
  const seen = new Set<string>(
    usedTopics.map((topic) => normalizeSceneTopic(topic))
  );
  const cards: SceneCandidate[] = [];
  for (const candidate of selected) {
    const topicKey = normalizeSceneTopic(candidate.topic);
    if (seen.has(topicKey)) continue;
    seen.add(topicKey);
    cards.push(candidate);
  }

  for (const template of FALLBACK_SCENE_TEMPLATES) {
    if (cards.length >= SHOW_COUNT) break;
    const topicKey = normalizeSceneTopic(template.topic);
    if (seen.has(topicKey)) continue;
    seen.add(topicKey);
    cards.push({ ...template, difficulty: preferredLevel });
  }

  let syntheticIndex = 0;
  while (cards.length < SHOW_COUNT) {
    const template =
      SYNTHETIC_SCENE_TEMPLATES[syntheticIndex % SYNTHETIC_SCENE_TEMPLATES.length];
    syntheticIndex += 1;
    const topic = `fallback-topic-${syntheticIndex}`;
    const topicKey = normalizeSceneTopic(topic);
    if (seen.has(topicKey)) continue;
    seen.add(topicKey);
    cards.push({
      id: `synthetic-${syntheticIndex}`,
      topic,
      title: `${template.title} ${syntheticIndex}`,
      description: template.description,
      knowledgePoint: template.knowledgePoint,
      difficulty: preferredLevel,
    });
  }

  const usedEmojis = new Set<string>();
  return cards.slice(0, SHOW_COUNT).map((card, index) => ({
    ...card,
    emoji: pickUniqueEmoji(card, usedEmojis, index),
  }));
}

function pickUniqueEmoji(
  scene: SceneCandidate,
  usedEmojis: Set<string>,
  index: number
): string {
  const preferred = pickEmojiCandidates(scene);
  const candidates = [...preferred, ...EMOJI_FALLBACK_POOL];
  for (const emoji of candidates) {
    if (usedEmojis.has(emoji)) continue;
    usedEmojis.add(emoji);
    return emoji;
  }
  const fallback = `✨${index + 1}`;
  usedEmojis.add(fallback);
  return fallback;
}

function pickEmojiCandidates(scene: SceneCandidate): string[] {
  const text = `${scene.topic} ${scene.title} ${scene.description}`.toLowerCase();
  for (const category of SCENE_EMOJI_CATEGORIES) {
    if (category.keywords.some((keyword) => text.includes(keyword))) {
      return category.emojis;
    }
  }
  return [];
}

const EMOJI_FALLBACK_POOL = [
  '🍽️',
  '☕',
  '✈️',
  '🧭',
  '🏫',
  '📚',
  '🛍️',
  '🧳',
  '🏥',
  '💼',
  '🎉',
  '🏨',
  '📱',
  '🏠',
  '🎬',
  '⚽',
  '🏦',
  '🌦️',
  '🛒',
  '🛫',
  '🤝',
  '📝',
  '🗺️',
  '🚇',
];

function formatDifficultyFeedback(
  adjustment: DifficultyAdjustmentResult | undefined
): string {
  if (!adjustment) return '';
  const directionText =
    adjustment.direction === 'down' ? '降低' : '提高';
  if (!adjustment.changed) {
    return adjustment.direction === 'down'
      ? `已经是最轻松的 ${adjustment.previousLevel} 难度了。我会继续按这个难度准备更容易入口的场景。\n`
      : `已经是最高的 ${adjustment.previousLevel} 难度了。我会继续按这个难度准备更有挑战的场景。\n`;
  }
  return `收到,我已把练习难度从 ${adjustment.previousLevel} ${directionText}到 ${adjustment.nextLevel}。\n`;
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

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
