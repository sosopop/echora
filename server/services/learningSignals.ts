/**
 * 批改后的学习信号写入:错误标签事件 + 掌握度。
 */

import type { Db } from '../db/connect.js';
import type { ExerciseAttemptDTO } from './exerciseAttempt.js';
import type { GradingResultDTO } from './gradingResult.js';
import { createErrorTagEvents } from './errorTagEvent.js';
import { applyMasteryUpdate } from './masteryRecord.js';

function uniqueTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function masteryTagsForAttempt(
  attempt: ExerciseAttemptDTO,
  grading: GradingResultDTO
): string[] {
  const correctionTags = uniqueTags(grading.corrections.tags ?? []);
  if (correctionTags.length > 0) return correctionTags;
  return [attempt.questionType || `stage_${attempt.stage}`];
}

export interface RecordGradingLearningSignalsInput {
  userId: number;
  attempt: ExerciseAttemptDTO;
  grading: GradingResultDTO;
}

export function recordGradingLearningSignals(
  db: Db,
  input: RecordGradingLearningSignalsInput
): void {
  const errorTags = input.grading.corrections.tags ?? [];
  createErrorTagEvents(db, {
    attemptId: input.attempt.id,
    gradingId: input.grading.id,
    userId: input.userId,
    score: input.grading.score,
    tags: errorTags,
  });
  for (const tag of masteryTagsForAttempt(input.attempt, input.grading)) {
    applyMasteryUpdate(db, {
      userId: input.userId,
      tag,
      score: input.grading.score,
      isCorrect: input.grading.isCorrect,
    });
  }
}
