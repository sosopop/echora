/**
 * practice skill 4 阶段推进辅助(MVP 仅阶段 1+2)
 *
 * 阶段定义(PRD §2.6):
 *   1. 填空(fill_word):从 dialogue.turns 选一句 en,挖关键词
 *   2. 整句翻译(sentence_translation):给中文 zh,要求用户写完整英文
 *   3. 对话接龙(留 004)
 *   4. 角色互换(留 004)
 *
 * 每阶段 MVP 出 2 题,通过 countStagePassed 推进。
 */

import type { Db } from '../../db/connect.js';
import type { SceneDialogueDTO } from '../../../shared/api.js';
import {
  countStagePassed,
  maxQuestionNo,
} from '../../services/exerciseAttempt.js';

export const STAGE_GOAL = 2; // MVP 每阶段 2 题
export const MAX_STAGE_MVP = 2; // MVP 仅做阶段 1+2

export interface NextQuestion {
  /** 下一题阶段;若返 > MAX_STAGE_MVP 表示本场景 MVP 已完成 */
  stage: number;
  /** 该阶段下一题号(从 1 开始) */
  questionNo: number;
}

/**
 * 根据当前 attempts 推断下一题应是哪个阶段、第几题。
 * 规则:
 *   - 从阶段 1 起:countStagePassed(stage) 达到 STAGE_GOAL → 进下一阶段
 *   - 阶段内 maxQuestionNo + 1 = 下一题号
 */
export function decideNextQuestion(
  db: Db,
  conversationId: number
): NextQuestion {
  for (let stage = 1; stage <= MAX_STAGE_MVP; stage++) {
    const passed = countStagePassed(db, conversationId, stage);
    if (passed < STAGE_GOAL) {
      const maxNo = maxQuestionNo(db, conversationId, stage);
      return { stage, questionNo: maxNo + 1 };
    }
  }
  // 所有 MVP 阶段已通
  return { stage: MAX_STAGE_MVP + 1, questionNo: 1 };
}

/* ============================================================
 * 出题模板:从 dialogue.turns 选句
 * ========================================================== */

export interface BuiltQuestion {
  questionType: 'fill_word' | 'sentence_translation';
  prompt: string;
  /** 渲染 widget 用的额外字段 */
  display: {
    contextZh: string;        // 中文上下文(给用户看)
    contextEn?: string;       // 英文上下文(阶段 1 才显示带空白)
    hint?: string;            // 提示
    inputMode: 'fill' | 'chat';
  };
  /** 参考答案(grade 时用) */
  referenceAnswer: string;
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
 * 从 dialogue.turns 选第 questionNo 个可用 turn(简化:按顺序取,跳过过短的)。
 * MVP:阶段 1 从 turns[0+offset], 阶段 2 从 turns[2+offset] 起拿,避免同 turn 两次问
 */
export function buildQuestionFromTurn(
  dialogue: SceneDialogueDTO,
  stage: number,
  questionNo: number
): BuiltQuestion | null {
  // 阶段 1 用前 STAGE_GOAL 句,阶段 2 用后 STAGE_GOAL 句
  const baseIdx = stage === 1 ? 0 : STAGE_GOAL;
  const turnIdx = baseIdx + (questionNo - 1);
  if (turnIdx >= dialogue.turns.length) return null;
  const turn = dialogue.turns[turnIdx];
  if (stage === 1) return buildFillBlank(turn);
  return buildSentenceTranslation(turn);
}
