/**
 * review Skill — 基于结构化练习记录生成学习报告
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import { getActiveSceneDialogue } from '../services/sceneDialogue.js';
import { listErrorTagSummaryByConversation } from '../services/errorTagEvent.js';
import { listMasteryRecords } from '../services/masteryRecord.js';
import type { GradingCorrections } from '../services/gradingResult.js';
import { decodeAttemptPrompt } from '../services/attemptPrompt.js';
import { ErrorTagSchema, QuestionTypeSchema } from '../../shared/widget.js';

interface ReviewAttemptRow {
  attempt_id: number;
  scene_id: string | null;
  stage: number;
  question_no: number;
  question_type: string;
  prompt: string;
  user_answer: string | null;
  score: number;
  is_correct: number;
  corrections: string | null;
  graded_at: string;
}

function listReviewAttempts(
  ctx: ServerSkillContext,
  sceneId?: string | null
): ReviewAttemptRow[] {
  const sql = sceneId
    ? `SELECT a.id AS attempt_id,
              a.scene_id,
              a.stage,
              a.question_no,
              a.question_type,
              a.prompt,
              a.user_answer,
              g.score,
              g.is_correct,
              g.corrections,
              g.created_at AS graded_at
       FROM exercise_attempts a
       JOIN grading_results g ON g.attempt_id = a.id
       WHERE a.conversation_id = ?
         AND a.scene_id = ?
       ORDER BY a.stage ASC, a.question_no ASC, a.id ASC`
    : `SELECT a.id AS attempt_id,
              a.scene_id,
              a.stage,
              a.question_no,
              a.question_type,
              a.prompt,
              a.user_answer,
              g.score,
              g.is_correct,
              g.corrections,
              g.created_at AS graded_at
       FROM exercise_attempts a
       JOIN grading_results g ON g.attempt_id = a.id
       WHERE a.conversation_id = ?
       ORDER BY a.stage ASC, a.question_no ASC, a.id ASC`;
  return sceneId
    ? ctx.db
        .prepare<[number, string], ReviewAttemptRow>(sql)
        .all(ctx.conversationId, sceneId)
    : ctx.db
        .prepare<[number], ReviewAttemptRow>(sql)
        .all(ctx.conversationId);
}

function safeParseCorrections(v: string | null): GradingCorrections {
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as GradingCorrections)
      : {};
  } catch {
    return {};
  }
}

function labelForQuestionType(questionType: string): string {
  switch (questionType) {
    case 'fill_word':
      return '单词填空';
    case 'sentence_translation':
      return '整句翻译';
    case 'dialogue_chain':
      return '对话接龙';
    case 'role_reversal':
      return '角色互换';
    default:
      return '练习题';
  }
}

function averageScore(rows: ReviewAttemptRow[]): number {
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length);
}

function compactPrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim();
  return oneLine.length > 34 ? `${oneLine.slice(0, 34)}...` : oneLine;
}

function normalizeQuestionType(questionType: string): string {
  return QuestionTypeSchema.safeParse(questionType).success
    ? questionType
    : 'fill_word';
}

function normalizeErrorTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag) => ErrorTagSchema.safeParse(tag).success);
}

function statusForScore(score: number): 'ok' | 'warn' | 'bad' {
  if (score >= 80) return 'ok';
  if (score >= 60) return 'warn';
  return 'bad';
}

type ReviewCategory = 'exact' | 'similar' | 'incorrect';

function categoryForRow(row: ReviewAttemptRow): ReviewCategory {
  const corrections = safeParseCorrections(row.corrections);
  if (
    corrections.category === 'exact' ||
    corrections.category === 'similar' ||
    corrections.category === 'incorrect'
  ) {
    return corrections.category;
  }
  if (row.is_correct !== 1) return 'incorrect';
  return row.score >= 95 ? 'exact' : 'similar';
}

function categoryCounts(rows: ReviewAttemptRow[]): Record<ReviewCategory, number> {
  return rows.reduce<Record<ReviewCategory, number>>(
    (acc, row) => {
      acc[categoryForRow(row)] += 1;
      return acc;
    },
    { exact: 0, similar: 0, incorrect: 0 }
  );
}

function buildAnswerReviewItems(rows: ReviewAttemptRow[]): Array<{
  questionNo: number;
  promptShort: string;
  questionType: string;
  score: number;
  status: 'ok' | 'warn' | 'bad';
  tags: string[];
}> {
  return rows.map((row, idx) => {
    const prompt = decodeAttemptPrompt(row.prompt).prompt;
    const corrections = safeParseCorrections(row.corrections);
    return {
      questionNo: idx + 1,
      promptShort: compactPrompt(prompt),
      questionType: normalizeQuestionType(row.question_type),
      score: row.score,
      status: statusForScore(row.score),
      tags: normalizeErrorTags(corrections.tags),
    };
  });
}

function buildStrongPoints(rows: ReviewAttemptRow[]): string[] {
  const strong = rows
    .filter((row) => row.score >= 85)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(
      (row) =>
        `${labelForQuestionType(row.question_type)} · 第 ${row.stage}-${row.question_no} 题`
    );
  if (strong.length > 0) return strong;
  return rows.length > 0 ? ['本轮已经完成全部题目,可以从薄弱点继续稳住节奏。'] : [];
}

function buildWeakPoints(
  rows: ReviewAttemptRow[],
  tags: Array<{ tag: string; count: number }>
): string[] {
  const tagged = tags
    .slice(0, 3)
    .map((tag) => `${tag.tag} · 出现 ${tag.count} 次`);
  if (tagged.length > 0) return tagged;
  return rows
    .filter((row) => row.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(
      (row) =>
        `${labelForQuestionType(row.question_type)} · ${compactPrompt(row.prompt)}`
    );
}

function buildSuggestions(
  sceneName: string,
  weakPoints: string[],
  avg: number
): Array<{ title: string; desc: string; action: string }> {
  if (weakPoints.length > 0) {
    const tag = weakPoints[0].split('·')[0].trim();
    return [
      {
        title: `重练 ${tag}`,
        desc: '后续可基于这个薄弱点生成专项题,先把这类错误压下去。',
        action: `retry:${tag}`,
      },
      {
        title: `换一个相近场景`,
        desc: `继续用 ${sceneName} 相关表达做迁移练习。`,
        action: 'request-new-scenes',
      },
    ];
  }
  return [
    {
      title: avg >= 85 ? '挑战更自然的表达' : '再来一轮巩固',
      desc:
        avg >= 85
          ? '本轮基础达标,下一轮可以尝试更完整、更自然的句子。'
          : '本轮没有集中错误标签,适合换一批场景继续保持手感。',
      action: 'request-new-scenes',
    },
  ];
}

function buildTitle(sceneName: string, avg: number): string {
  if (avg >= 90) return `${sceneName} · 表现很稳`;
  if (avg >= 80) return `${sceneName} · 已经达标`;
  if (avg >= 60) return `${sceneName} · 继续巩固`;
  return `${sceneName} · 需要复盘`;
}

export const reviewSkill: Skill = {
  name: SKILL_NAMES.review,
  description: '查询学习记录,生成结构化学习报告',
  allowedStates: ['awaiting_next', 'reviewing', 'scene_selecting', 'archived'],
  primaryWidget: 'progress-summary',
  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const dialogue = getActiveSceneDialogue(ctx.db, ctx.conversationId);
    const sceneId = dialogue?.sceneId ?? null;
    const sceneName = dialogue?.title ?? '当前会话';
    const attempts = listReviewAttempts(ctx, sceneId);

    yield {
      type: 'state-transition',
      payload: { nextLearningState: 'reviewing', activeSkill: 'review' },
    };

    if (attempts.length === 0) {
      yield {
        type: 'text-chunk',
        payload: {
          text:
            '这一轮还没有可复盘的批改记录。先完成一组练习后,我再给你整理学习报告。',
        },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    const avg = averageScore(attempts);
    const tagSummary = listErrorTagSummaryByConversation(
      ctx.db,
      ctx.conversationId,
      sceneId
    );
    const distribution = categoryCounts(attempts);
    const strongPoints = buildStrongPoints(attempts);
    const weakPoints = buildWeakPoints(attempts, tagSummary);
    const relatedTags = new Set([
      ...tagSummary.map((tag) => tag.tag),
      ...attempts.map((row) => row.question_type),
    ]);
    const masteries = listMasteryRecords(ctx.db, ctx.user.id, 12)
      .filter((row) => relatedTags.size === 0 || relatedTags.has(row.tag))
      .slice(0, 5)
      .map((row) => ({
        tag: row.tag,
        score: row.masteryScore,
        delta: 0,
      }));
    const widgetId = ctx.makeWidgetId('progress-summary');
    const answerReviewWidgetId = ctx.makeWidgetId('answer-review');
    const answerReviewItems = buildAnswerReviewItems(attempts);

    yield {
      type: 'text-chunk',
      payload: {
        text:
          `本轮复盘来了:你完成了 ${attempts.length} 题,` +
          `完全正确 ${distribution.exact} 题,还不错 ${distribution.similar} 题,` +
          `错误 ${distribution.incorrect} 题。`,
      },
    };
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'progress-summary',
          status: 'loading',
          data: {},
          version: 1,
        },
      },
    };
    yield {
      type: 'widget-ready',
      payload: {
        widgetId,
        patch: {
          status: 'ready',
          data: {
            title: buildTitle(sceneName, avg),
            sceneName,
            questionsCount: attempts.length,
            averageScore: avg,
            averageScoreDelta: 0,
            categoryCounts: distribution,
            weakTagsCount: tagSummary.length,
            masteredScenesCount: masteries.filter((row) => row.score >= 80)
              .length,
            masteries,
            strongPoints,
            weakPoints,
            nextSuggestions: buildSuggestions(sceneName, weakPoints, avg),
          },
        },
      },
    };
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: answerReviewWidgetId,
          type: 'answer-review',
          status: 'loading',
          data: {},
          version: 1,
        },
      },
    };
    yield {
      type: 'widget-ready',
      payload: {
        widgetId: answerReviewWidgetId,
        patch: {
          status: 'ready',
          data: {
            title: `${sceneName} · ${answerReviewItems.length} 道题回看`,
            items: answerReviewItems,
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};
