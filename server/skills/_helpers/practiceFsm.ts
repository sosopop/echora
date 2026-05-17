/**
 * practice skill 4 阶段推进辅助
 *
 * 阶段定义(PRD §2.6):
 *   1. 填空(fill_word):从 dialogue.turns 选一句 en,挖关键词
 *   2. 整句翻译(sentence_translation):给中文 zh,要求用户写完整英文
 *   3. 对话接龙(dialogue_chain):给上一句英文,要求用户接下一句
 *   4. 角色互换(role_reversal):用户扮演指定角色主动说一句
 *
 * 每阶段出 2 题,通过 countStagePassed 推进。
 */

import type { Db } from '../../db/connect.js';
import type { SceneDialogueDTO } from '../../../shared/api.js';
import { countStageHandled } from '../../services/exerciseAttempt.js';

export const STAGE_GOAL = 2; // 每阶段 2 题,整场 8 题
export const MAX_STAGE_MVP = 4;

export interface NextQuestion {
  /** 下一题阶段;若返 > MAX_STAGE_MVP 表示本场景已完成 */
  stage: number;
  /** 该阶段下一题号(从 1 开始) */
  questionNo: number;
}

/**
 * 根据当前 attempts 推断下一题应是哪个阶段、第几题。
 * 规则:
 *   - 从阶段 1 起:countStageHandled(stage) 达到 STAGE_GOAL → 进下一阶段
 *   - 阶段内题号由"已处理数量 + 1"决定,避免未答/错题/重复点击把题号推到模板之外
 *   - needs_review 算已处理,避免同题 2 次失败后被永久卡住
 */
export function decideNextQuestion(
  db: Db,
  conversationId: number,
  sceneId?: string | null
): NextQuestion {
  for (let stage = 1; stage <= MAX_STAGE_MVP; stage++) {
    const handled = countStageHandled(db, conversationId, stage, sceneId);
    if (handled < STAGE_GOAL) {
      return { stage, questionNo: handled + 1 };
    }
  }
  // 所有 MVP 阶段已通
  return { stage: MAX_STAGE_MVP + 1, questionNo: 1 };
}

/* ============================================================
 * 出题模板:从 dialogue.turns 选句
 * ========================================================== */

export interface BuiltQuestion {
  questionType:
    | 'fill_word'
    | 'sentence_translation'
    | 'dialogue_chain'
    | 'role_reversal';
  prompt: string;
  /** 渲染 widget 用的额外字段 */
  display: {
    contextZh: string;        // 中文上下文(给用户看)
    contextEn?: string;       // 英文上下文(阶段 1 才显示带空白)
    targetZh?: string;        // 用户需要用英文表达的中文目标句
    hint?: string;            // 提示
    inputMode: 'fill' | 'chat';
  };
  /** 参考答案(grade 时用) */
  referenceAnswer: string;
  /** 阶段 4 答对后可展示的对方回应 */
  followUpResponse?: {
    role: string;
    en: string;
    zh: string;
  };
}

/**
 * 阶段 1 · 填空:从 turn.en 挖第一个长度 ≥ 4 的实词作为空,题干显示中文 + 英文挖空版。
 */
function buildFillBlank(turn: { en: string; zh: string }): BuiltQuestion {
  const words = turn.en.split(/(\s+|[,.!?;:])/);
  // 选第一个长度 ≥ 4 的字母词
  let blankIdx = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^[a-zA-Z]{4,}$/.test(w)) {
      blankIdx = i;
      break;
    }
  }
  if (blankIdx < 0) {
    // fallback:挖最后一个词
    blankIdx = words.length - 1;
  }
  const refAnswer = words[blankIdx];
  const blanked = words
    .map((w, i) => (i === blankIdx ? '______' : w))
    .join('');
  return {
    questionType: 'fill_word',
    prompt: `Fill the blank in: "${blanked}"`,
    display: {
      contextZh: turn.zh,
      contextEn: blanked,
      hint: `首字母:${refAnswer[0]}`,
      inputMode: 'fill',
    },
    referenceAnswer: refAnswer,
  };
}

/**
 * 阶段 2 · 整句翻译:给中文 turn.zh,要求英文 turn.en。
 */
function buildSentenceTranslation(turn: { en: string; zh: string }): BuiltQuestion {
  return {
    questionType: 'sentence_translation',
    prompt: `Translate to English: "${turn.zh}"`,
    display: {
      contextZh: turn.zh,
      hint: '请用一个完整的英文句子回答',
      inputMode: 'chat',
    },
    referenceAnswer: turn.en,
  };
}

/**
 * 阶段 3 · 对话接龙:展示上一句英文,用户写出下一句英文回复。
 */
function buildDialogueChain(
  previous: { role: string; en: string; zh: string },
  target: { role: string; en: string; zh: string }
): BuiltQuestion {
  return {
    questionType: 'dialogue_chain',
    prompt:
      `Continue the dialogue after "${previous.role}: ${previous.en}". ` +
      `Target meaning: "${target.zh}"`,
    display: {
      contextZh: '请接住这句对话,用英文回复。',
      contextEn: `${previous.role}: ${previous.en}`,
      targetZh: target.zh,
      hint: `你正在回应 ${previous.role},当前角色:${target.role}`,
      inputMode: 'chat',
    },
    referenceAnswer: target.en,
  };
}

/**
 * 阶段 4 · 角色互换:用户扮演目标角色主动开口,答对后可展示下一句回应。
 */
function buildRoleReversal(
  target: { role: string; en: string; zh: string },
  response?: { role: string; en: string; zh: string }
): BuiltQuestion {
  return {
    questionType: 'role_reversal',
    prompt: `Role reversal: play ${target.role}. Say this in English: "${target.zh}"`,
    display: {
      contextZh: `角色互换:你现在扮演 ${target.role},请把下面这句话用英文说出来。`,
      targetZh: target.zh,
      hint: `当前角色:${target.role};先主动开口,不用等对方提问。`,
      inputMode: 'chat',
    },
    referenceAnswer: target.en,
    followUpResponse: response,
  };
}

function lastAdjacentPair(
  turns: SceneDialogueDTO['turns']
): [{ role: string; en: string; zh: string }, { role: string; en: string; zh: string }] | null {
  if (turns.length < 2) return null;
  return [turns[turns.length - 2], turns[turns.length - 1]];
}

function dialogueChainPair(
  turns: SceneDialogueDTO['turns'],
  questionNo: number
): [{ role: string; en: string; zh: string }, { role: string; en: string; zh: string }] | null {
  if (turns.length < 2) return null;
  const targetIdx = 2 * STAGE_GOAL + (questionNo - 1);
  if (targetIdx < turns.length) {
    return [turns[Math.max(0, targetIdx - 1)], turns[targetIdx]];
  }
  return lastAdjacentPair(turns);
}

function roleReversalTarget(
  turns: SceneDialogueDTO['turns'],
  questionNo: number
): [{ role: string; en: string; zh: string }, { role: string; en: string; zh: string } | undefined] | null {
  if (turns.length === 0) return null;
  if (turns.length === 1) return [turns[0], undefined];
  const targetIdx = Math.min(questionNo - 1, turns.length - 2);
  return [turns[targetIdx], turns[targetIdx + 1]];
}

/**
 * 从 dialogue.turns 选第 questionNo 个可用 turn(简化:按顺序取,跳过过短的)。
 * 阶段 1 从 turns[0+offset],阶段 2 从 turns[2+offset] 起拿,避免同 turn 两次问。
 * 阶段 3/4 在短对话中允许复用相邻 turn,减少后半场断流。
 */
export function buildQuestionFromTurn(
  dialogue: SceneDialogueDTO,
  stage: number,
  questionNo: number
): BuiltQuestion | null {
  if (stage === 1 || stage === 2) {
    const baseIdx = stage === 1 ? 0 : STAGE_GOAL;
    const turnIdx = baseIdx + (questionNo - 1);
    if (turnIdx >= dialogue.turns.length) return null;
    const turn = dialogue.turns[turnIdx];
    return stage === 1 ? buildFillBlank(turn) : buildSentenceTranslation(turn);
  }

  if (stage === 3) {
    const pair = dialogueChainPair(dialogue.turns, questionNo);
    return pair ? buildDialogueChain(pair[0], pair[1]) : null;
  }

  if (stage === 4) {
    const target = roleReversalTarget(dialogue.turns, questionNo);
    return target ? buildRoleReversal(target[0], target[1]) : null;
  }

  return null;
}
