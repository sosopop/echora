/**
 * grade skill 辅助:批改 prompt + tool
 */

import type { ExerciseAttemptDTO } from '../../services/exerciseAttempt.js';
import type { SceneDialogueDTO } from '../../../shared/api.js';
import type { ToolDef, AIProvider, ChatStreamEvent } from '../../ai/types.js';
import type { GradingCorrections } from '../../services/gradingResult.js';
import { buildQuestionFromTurn } from './practiceFsm.js';
import type { StageGoalPlan } from '../../services/stageGoal.js';
import { decodeAttemptPrompt } from '../../services/attemptPrompt.js';

const ALLOWED_TAGS = [
  'spelling',
  'word_order',
  'tense',
  'preposition',
  'article',
  'subject_verb_agreement',
  'auxiliary_verb',
  'collocation',
  'politeness',
  'literal_translation',
  'missing_word',
  'extra_word',
];

export type GradingCategory = 'exact' | 'similar' | 'incorrect';

export const gradeAnswerTool: ToolDef = {
  name: 'grade_answer',
  description:
    '批改用户对当前题目的英文答案。' +
    '接受同义表达;严宽尺度按 CEFR 等级。' +
    '返回三档 category(exact/similar/incorrect)+ 内部 score + corrections(参考答案+解释+12 类错误标签)。',
  inputSchema: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 100 },
      is_correct: { type: 'boolean' },
      category: {
        type: 'string',
        enum: ['exact', 'similar', 'incorrect'],
        description:
          'exact=与参考答案完全匹配;similar=意思相近可通过;incorrect=语法/拼写/意思不一致',
      },
      reference_answer: { type: 'string', description: '参考答案(标准英文)' },
      explanation: { type: 'string', description: '简体中文解释,1-2 句' },
      tags: {
        type: 'array',
        items: { type: 'string', enum: ALLOWED_TAGS },
        description: '本题命中的错误标签,正确时空数组',
      },
    },
    required: ['score', 'is_correct', 'reference_answer', 'explanation', 'tags'],
    additionalProperties: false,
  },
};

export function buildGradePrompt(
  attempt: ExerciseAttemptDTO,
  dialogue: SceneDialogueDTO | null,
  userAnswer: string,
  stageGoalPlan?: StageGoalPlan
): string {
  const ctxLine = dialogue
    ? `场景:${dialogue.title} (${dialogue.difficulty}) · 角色:${dialogue.roles.join(' / ')}`
    : '(场景上下文缺失)';
  const promptInfo = decodeAttemptPrompt(attempt.prompt);
  const reference = promptInfo.referenceAnswer ?? (dialogue
    ? buildQuestionFromTurn(
        dialogue,
        attempt.stage,
        attempt.questionNo,
        stageGoalPlan
      )
        ?.referenceAnswer
    : null);
  return [
    '你是 Echora 英语教练,负责批改用户的练习答案。',
    '',
    ctxLine,
    `题型:${attempt.questionType}(阶段 ${attempt.stage} 第 ${attempt.questionNo} 题)`,
    promptInfo.kind ? `题目来源:${promptInfo.kind}` : null,
    promptInfo.targetTag ? `目标薄弱点:${promptInfo.targetTag}` : null,
    `题目:${promptInfo.prompt}`,
    reference ? `参考答案:${reference}` : null,
    `用户答案:${userAnswer}`,
    `重试次数:${attempt.retryCount}(0=首答, 1=第二次)`,
    '',
    '批改原则:',
    '- 接受同义表达、大小写宽容、轻微标点宽容',
    '- 若提供参考答案,必须以参考答案作为主要批改依据',
    '- 面向用户只分三档,不要输出百分制概念:',
    '  1) exact: 用户答案与参考答案完全匹配(忽略大小写、首尾空格、句末标点)',
    '  2) similar: 意思相近、语法可接受,但和参考答案不完全一样',
    '  3) incorrect: 语法、单词拼写或表达意思与参考答案不一致',
    '- is_correct = category 为 exact 或 similar;incorrect 必须 is_correct=false',
    '- score 仅用于内部统计:exact 建议 100;similar 建议 85;incorrect 按错误严重度给 0-60',
    '- 错误标签只在 incorrect 时从 12 类中选(spelling / word_order / tense / preposition / article / ' +
      'subject_verb_agreement / auxiliary_verb / collocation / politeness / literal_translation / ' +
      'missing_word / extra_word),exact/similar 时空数组',
    '- explanation 简体中文,1-2 句;exact 简短肯定,similar 说明为什么意思能接受,incorrect 点出主要错误',
    '',
    '必须通过 grade_answer 工具调用回应。',
  ].filter((line): line is string => line !== null).join('\n');
}

export interface GradeResult {
  score: number;
  isCorrect: boolean;
  category: GradingCategory;
  corrections: GradingCorrections;
}

export async function runGrading(
  provider: AIProvider,
  attempt: ExerciseAttemptDTO,
  dialogue: SceneDialogueDTO | null,
  userAnswer: string,
  signal: AbortSignal,
  stageGoalPlan?: StageGoalPlan
): Promise<GradeResult> {
  if (!provider.chat) {
    throw new Error('Provider does not support chat()');
  }
  const system = buildGradePrompt(attempt, dialogue, userAnswer, stageGoalPlan);
  let result: GradeResult | null = null;
  for await (const ev of provider.chat({
    system,
    messages: [{ role: 'user', content: userAnswer }],
    tools: [gradeAnswerTool],
    toolChoice: { type: 'tool', name: 'grade_answer' },
    maxTokens: 1024,
    signal,
  }) as AsyncIterable<ChatStreamEvent>) {
    if (signal.aborted) throwAbortError();
    if (ev.type === 'tool-use' && ev.toolName === 'grade_answer') {
      const input = ev.input as {
        score?: number;
        is_correct?: boolean;
        category?: string;
        reference_answer?: string;
        explanation?: string;
        tags?: string[];
      };
      const referenceAnswer = input.reference_answer;
      const category = normalizeCategory(
        input.category,
        input.is_correct,
        input.score,
        userAnswer,
        referenceAnswer
      );
      const score = normalizeScore(input.score, category);
      result = {
        score,
        isCorrect: category !== 'incorrect',
        category,
        corrections: {
          category,
          referenceAnswer,
          explanation: input.explanation,
          tags: category === 'incorrect' && Array.isArray(input.tags)
            ? input.tags.filter((t) => ALLOWED_TAGS.includes(t))
            : [],
        },
      };
    }
  }
  if (signal.aborted) throwAbortError();
  if (!result) {
    throw new Error('LLM 未返回有效批改结果');
  }
  return result;
}

function throwAbortError(): never {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}

function normalizeCategory(
  rawCategory: string | undefined,
  rawIsCorrect: boolean | undefined,
  rawScore: number | undefined,
  userAnswer: string,
  referenceAnswer: string | undefined
): GradingCategory {
  if (isExactAnswer(userAnswer, referenceAnswer)) return 'exact';
  if (
    rawCategory === 'exact' ||
    rawCategory === 'similar' ||
    rawCategory === 'incorrect'
  ) {
    return rawCategory;
  }
  return rawIsCorrect === true || (rawScore ?? 0) >= 80
    ? 'similar'
    : 'incorrect';
}

function normalizeScore(
  rawScore: number | undefined,
  category: GradingCategory
): number {
  const fallback =
    category === 'exact' ? 100 : category === 'similar' ? 85 : 40;
  const score = Math.max(0, Math.min(100, Math.round(rawScore ?? fallback)));
  if (category === 'exact') return Math.max(score, 95);
  if (category === 'similar') return Math.max(score, 80);
  return Math.min(score, 60);
}

function isExactAnswer(
  userAnswer: string,
  referenceAnswer: string | undefined
): boolean {
  if (!referenceAnswer) return false;
  return normalizeAnswer(userAnswer) === normalizeAnswer(referenceAnswer);
}

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:"'`，。！？；：“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
