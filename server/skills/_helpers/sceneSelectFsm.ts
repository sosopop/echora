/**
 * scene-select skill 辅助:propose / dialogue 生成 prompts + 候选筛选
 */

import type { CefrLevel, ProfileDTO, SceneDialogueTurn } from '../../../shared/api.js';
import type {
  ToolDef,
  AIProvider,
  ChatStreamEvent,
  DebugContext,
} from '../../ai/types.js';
import { debugProviderChat } from '../../ai/debugChat.js';
import type { DebugLogger } from '../../utils/debugLog.js';

export interface SceneCandidate {
  id: string;
  topic: string;
  title: string;
  description: string;
  knowledgePoint: string;
  difficulty: CefrLevel;
}

/* ============================================================
 * propose_scenes:LLM 出 N 个候选场景主题
 * ========================================================== */
export const proposeScenesTool: ToolDef = {
  name: 'propose_scenes',
  description:
    '基于用户画像和已用场景,生成 N 个不重复、多样化的候选场景主题。' +
    '每个场景对应一个真实生活情境,可用于英语对话练习。' +
    '避免与 used_topics 列表重复或过度相似。',
  inputSchema: {
    type: 'object',
    properties: {
      scenes: {
        type: 'array',
        minItems: 5,
        maxItems: 25,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '场景短 ID,kebab-case' },
            topic: { type: 'string', description: '主题关键词,单短语' },
            title: { type: 'string', description: '展示标题,如「餐厅点餐」' },
            description: { type: 'string', description: '一句话描述' },
            knowledgePoint: { type: 'string', description: '主要知识点,如「礼貌请求」' },
            difficulty: {
              type: 'string',
              enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
            },
          },
          required: ['id', 'topic', 'title', 'description', 'knowledgePoint', 'difficulty'],
        },
      },
    },
    required: ['scenes'],
    additionalProperties: false,
  },
};

export function buildProposeScenesPrompt(
  profile: ProfileDTO,
  usedTopics: string[],
  count: number
): string {
  return [
    '你是 Echora 英语教练。',
    '为下面这位用户生成候选场景主题,用于英语对话练习。',
    '',
    `用户画像:姓名=${profile.name ?? '未知'} 年级=${profile.grade ?? '未填'} 英语水平=${profile.level ?? 'B1'}`,
    usedTopics.length > 0
      ? `用户最近已练过(请避免重复或近似):${usedTopics.join(' / ')}`
      : '用户尚未练过任何场景。',
    '',
    `请通过 propose_scenes 工具一次生成 ${count} 个不同的候选场景。`,
    '要求:',
    '- 主题多样:覆盖学习/工作/生活/旅行/社交等不同场景',
    '- 难度按用户当前 CEFR 等级匹配(±1 级范围)',
    '- 不得与 used_topics 列表重复或近似',
    '- title 简体中文,4-8 字',
    '- description 一句话简体中文 (15-30 字)',
  ].join('\n');
}

/**
 * 从候选池选 K 个(简单实现:已 LLM 过滤 used,这里再按 difficulty 匹配排序后取前 K)。
 */
export function selectTopK(
  candidates: SceneCandidate[],
  usedTopics: string[],
  k: number,
  preferredLevel: CefrLevel = 'B1'
): SceneCandidate[] {
  const usedSet = new Set(usedTopics.map((s) => normalizeSceneTopic(s)));
  const seenTopics = new Set<string>();
  const filtered: SceneCandidate[] = [];
  for (const candidate of candidates) {
    const topicKey = normalizeSceneTopic(candidate.topic);
    if (usedSet.has(topicKey) || seenTopics.has(topicKey)) continue;
    seenTopics.add(topicKey);
    filtered.push(candidate);
  }
  // 按难度优先级排序:与用户等级精确匹配 > ±1 级 > 其他
  const levelOrder: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const pref = levelOrder.indexOf(preferredLevel);
  filtered.sort((a, b) => {
    const ad = Math.abs(levelOrder.indexOf(a.difficulty) - pref);
    const bd = Math.abs(levelOrder.indexOf(b.difficulty) - pref);
    return ad - bd;
  });
  return filtered.slice(0, k);
}

export function normalizeSceneTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function runScenePropose(
  provider: AIProvider,
  profile: ProfileDTO,
  usedTopics: string[],
  count: number,
  signal: AbortSignal,
  logDebug?: DebugLogger,
  debug?: DebugContext
): Promise<SceneCandidate[]> {
  if (!provider.chat) {
    throw new Error('Provider does not support chat()');
  }
  const system = buildProposeScenesPrompt(profile, usedTopics, count);
  let collected: SceneCandidate[] = [];
  for await (const ev of debugProviderChat(
    provider,
    {
      system,
      messages: [{ role: 'user', content: '请生成场景候选' }],
      tools: [proposeScenesTool],
      toolChoice: { type: 'tool', name: 'propose_scenes' },
      maxTokens: 4096,
      signal,
    },
    logDebug,
    { ...debug, phase: debug?.phase ?? 'scene-propose' }
  ) as AsyncIterable<ChatStreamEvent>) {
    if (signal.aborted) throwAbortError();
    if (ev.type === 'tool-use' && ev.toolName === 'propose_scenes') {
      const scenes = (ev.input as { scenes?: SceneCandidate[] }).scenes ?? [];
      collected = scenes;
    }
  }
  if (signal.aborted) throwAbortError();
  if (collected.length === 0) {
    throw new Error('LLM 未返回有效场景候选');
  }
  return collected;
}

/* ============================================================
 * generate_scene_dialogue:LLM 生成完整双语对话
 * ========================================================== */
export const generateDialogueTool: ToolDef = {
  name: 'generate_scene_dialogue',
  description:
    '为给定场景生成完整的双语对话内容,作为后续出题与判题的基础数据。' +
    '按 PRD §2.5 难度约束(词汇范围、句子复杂度、对话轮数、语法结构)生成。',
  inputSchema: {
    type: 'object',
    properties: {
      roles: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' },
        description: '对话角色列表,如 ["Customer","Waiter"]',
      },
      turns: {
        type: 'array',
        minItems: 4,
        maxItems: 14,
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },
            en: { type: 'string' },
            zh: { type: 'string' },
          },
          required: ['role', 'en', 'zh'],
        },
      },
    },
    required: ['roles', 'turns'],
    additionalProperties: false,
  },
};

const TURN_COUNT_BY_LEVEL: Record<CefrLevel, [number, number]> = {
  A1: [4, 6],
  A2: [4, 6],
  B1: [6, 10],
  B2: [6, 10],
  C1: [8, 14],
  C2: [8, 14],
};

export function buildGenerateDialoguePrompt(
  scene: SceneCandidate,
  profile: ProfileDTO
): string {
  const level = profile.level ?? scene.difficulty ?? 'B1';
  const [turnsMin, turnsMax] = TURN_COUNT_BY_LEVEL[level];
  return [
    '你是 Echora 英语教练,负责生成场景对话数据。',
    '',
    `场景:${scene.title} (${scene.description})`,
    `难度等级:${level}(CEFR)`,
    `知识点:${scene.knowledgePoint}`,
    `对话轮数范围:${turnsMin}-${turnsMax} 轮`,
    '',
    '难度约束(必须严格遵守):',
    `- 词汇:控制在 ${level} 等级核心词汇范围内,超纲词 ≤ 10%`,
    `- 句子复杂度:${level === 'A1' || level === 'A2' ? '简单句为主,一般现在/过去时' : '可适当用从句和现在完成/过去完成时'}`,
    '- 自然口语化,贴近真实对话情境',
    '',
    '通过 generate_scene_dialogue 工具返回:',
    '- roles:2-3 个角色名(英文,如 Customer, Waiter)',
    '- turns:完整双语对话,每条含 role / en / zh',
    'zh 必须是 en 的准确中文翻译,长度合理,不要逐字翻译。',
  ].join('\n');
}

export async function runDialogueGeneration(
  provider: AIProvider,
  profile: ProfileDTO,
  scene: SceneCandidate,
  signal: AbortSignal,
  logDebug?: DebugLogger,
  debug?: DebugContext
): Promise<{ roles: string[]; turns: SceneDialogueTurn[] }> {
  if (!provider.chat) {
    throw new Error('Provider does not support chat()');
  }
  const system = buildGenerateDialoguePrompt(scene, profile);
  let result: { roles: string[]; turns: SceneDialogueTurn[] } | null = null;
  for await (const ev of debugProviderChat(
    provider,
    {
      system,
      messages: [{ role: 'user', content: `请生成「${scene.title}」场景对话` }],
      tools: [generateDialogueTool],
      toolChoice: { type: 'tool', name: 'generate_scene_dialogue' },
      maxTokens: 4096,
      signal,
    },
    logDebug,
    { ...debug, phase: debug?.phase ?? 'scene-dialogue' }
  ) as AsyncIterable<ChatStreamEvent>) {
    if (signal.aborted) throwAbortError();
    if (ev.type === 'tool-use' && ev.toolName === 'generate_scene_dialogue') {
      const input = ev.input as { roles?: string[]; turns?: SceneDialogueTurn[] };
      result = {
        roles: input.roles ?? [],
        turns: input.turns ?? [],
      };
    }
  }
  if (signal.aborted) throwAbortError();
  if (!result || result.turns.length === 0) {
    throw new Error('LLM 未返回有效场景对话');
  }
  return result;
}

function throwAbortError(): never {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}
