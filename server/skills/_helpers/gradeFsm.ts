/**
 * grade skill 辅助:批改 prompt + tool
 */

import type { ExerciseAttemptDTO } from '../../services/exerciseAttempt.js';
import type { SceneDialogueDTO } from '../../../shared/api.js';
import type { ToolDef, AIProvider, ChatStreamEvent } from '../../ai/types.js';
import type { GradingCorrections } from '../../services/gradingResult.js';
import { buildQuestionFromTurn } from './practiceFsm.js';

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

export const gradeAnswerTool: ToolDef = {
  name: 'grade_answer',
  description:
    '批改用户对当前题目的英文答案。' +
    '接受同义表达;严宽尺度按 CEFR 等级。' +
    '返回 score(0-100)+ is_correct(>=80 即视为通过)+ corrections(参考答案+解释+12 类错误标签)。',
  inputSchema: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 100 },
      is_correct: { type: 'boolean' },
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
  userAnswer: string
): string {
  const ctxLine = dialogue
    ? `场景:${dialogue.title} (${dialogue.difficulty}) · 角色:${dialogue.roles.join(' / ')}`
    : '(场景上下文缺失)';
  const reference = dialogue
    ? buildQuestionFromTurn(dialogue, attempt.stage, attempt.questionNo)
        ?.referenceAnswer
    : null;
  return [
    '你是 Echora 英语教练,负责批改用户的练习答案。',
    '',
    ctxLine,
    `题型:${attempt.questionType}(阶段 ${attempt.stage} 第 ${attempt.questionNo} 题)`,
    `题目:${attempt.prompt}`,
    reference ? `参考答案:${reference}` : null,
    `用户答案:${userAnswer}`,
    `重试次数:${attempt.retryCount}(0=首答, 1=第二次)`,
    '',
    '批改原则:',
    '- 接受同义表达、大小写宽容、轻微标点宽容',
    '- 若提供参考答案,必须以参考答案作为主要批改依据',
    '- 评分尺度:90+ 优秀;80-89 通过;60-79 部分对;<60 未通过',
    '- is_correct = score >= 80',
    '- 错误标签从 12 类中选(spelling / word_order / tense / preposition / article / ' +
      'subject_verb_agreement / auxiliary_verb / collocation / politeness / literal_translation / ' +
      'missing_word / extra_word),正确题空数组',
    '- explanation 简体中文,1-2 句,先肯定后指出主要错误',
    '',
    '必须通过 grade_answer 工具调用回应。',
  ].filter((line): line is string => line !== null).join('\n');
}

export interface GradeResult {
  score: number;
  isCorrect: boolean;
  corrections: GradingCorrections;
}

export async function runGrading(
  provider: AIProvider,
  attempt: ExerciseAttemptDTO,
  dialogue: SceneDialogueDTO | null,
  userAnswer: string,
  signal: AbortSignal
): Promise<GradeResult> {
  if (!provider.chat) {
    throw new Error('Provider does not support chat()');
  }
  const system = buildGradePrompt(attempt, dialogue, userAnswer);
  let result: GradeResult | null = null;
  for await (const ev of provider.chat({
    system,
    messages: [{ role: 'user', content: userAnswer }],
    tools: [gradeAnswerTool],
    toolChoice: { type: 'tool', name: 'grade_answer' },
    maxTokens: 1024,
    signal,
  }) as AsyncIterable<ChatStreamEvent>) {
    if (ev.type === 'tool-use' && ev.toolName === 'grade_answer') {
      const input = ev.input as {
        score?: number;
        is_correct?: boolean;
        reference_answer?: string;
        explanation?: string;
        tags?: string[];
      };
      const score = Math.max(0, Math.min(100, Math.round(input.score ?? 0)));
      result = {
        score,
        isCorrect: input.is_correct === true || score >= 80,
        corrections: {
          referenceAnswer: input.reference_answer,
          explanation: input.explanation,
          tags: Array.isArray(input.tags)
            ? input.tags.filter((t) => ALLOWED_TAGS.includes(t))
            : [],
        },
      };
    }
  }
  if (!result) {
    throw new Error('LLM 未返回有效批改结果');
  }
  return result;
}
