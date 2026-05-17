/**
 * mastery_records 表服务
 *
 * 以 tag 为粒度记录用户对知识点/错误点的掌握度。
 */

import type { Db } from '../db/connect.js';

export interface MasteryRecordDTO {
  id: number;
  userId: number;
  tag: string;
  masteryScore: number;
  attemptsCount: number;
  correctCount: number;
  nextReviewAt: string | null;
  updatedAt: string;
  difficultyScore: number;
}

interface MasteryRecordRow {
  id: number;
  user_id: number;
  tag: string;
  mastery_score: number;
  attempts_count: number;
  correct_count: number;
  next_review_at: string | null;
  updated_at: string;
  difficulty_score: number;
}

function rowToDTO(row: MasteryRecordRow): MasteryRecordDTO {
  return {
    id: row.id,
    userId: row.user_id,
    tag: row.tag,
    masteryScore: row.mastery_score,
    attemptsCount: row.attempts_count,
    correctCount: row.correct_count,
    nextReviewAt: row.next_review_at,
    updatedAt: row.updated_at,
    difficultyScore: row.difficulty_score,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function masteryDelta(score: number, isCorrect: boolean): number {
  if (isCorrect && score >= 90) return 8;
  if (isCorrect) return 6;
  if (score >= 60) return -5;
  return -12;
}

function difficultyDelta(score: number, isCorrect: boolean): number {
  if (isCorrect && score >= 90) return 20;
  if (isCorrect) return 10;
  if (score >= 60) return -10;
  return -25;
}

function nextReviewAtFor(score: number): string {
  const days = score >= 80 ? 7 : score >= 60 ? 3 : 1;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function getMasteryRecord(
  db: Db,
  userId: number,
  tag: string
): MasteryRecordDTO | null {
  const row = db
    .prepare<[number, string], MasteryRecordRow>(
      'SELECT * FROM mastery_records WHERE user_id = ? AND tag = ?'
    )
    .get(userId, tag);
  return row ? rowToDTO(row) : null;
}

export interface ApplyMasteryUpdateInput {
  userId: number;
  tag: string;
  score: number;
  isCorrect: boolean;
}

export function applyMasteryUpdate(
  db: Db,
  input: ApplyMasteryUpdateInput
): MasteryRecordDTO {
  const tag = input.tag.trim();
  if (!tag) throw new Error('mastery tag 不能为空');
  const existing = getMasteryRecord(db, input.userId, tag);
  const previousMastery = existing?.masteryScore ?? 50;
  const previousDifficulty = existing?.difficultyScore ?? 500;
  const nextMastery = clamp(
    previousMastery + masteryDelta(input.score, input.isCorrect),
    0,
    100
  );
  const nextDifficulty = clamp(
    previousDifficulty + difficultyDelta(input.score, input.isCorrect),
    100,
    900
  );
  db.prepare(
    `INSERT INTO mastery_records
     (user_id, tag, mastery_score, attempts_count, correct_count, next_review_at, difficulty_score)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(user_id, tag) DO UPDATE SET
       mastery_score = excluded.mastery_score,
       attempts_count = mastery_records.attempts_count + 1,
       correct_count = mastery_records.correct_count + excluded.correct_count,
       next_review_at = excluded.next_review_at,
       difficulty_score = excluded.difficulty_score,
       updated_at = datetime('now')`
  ).run(
    input.userId,
    tag,
    nextMastery,
    input.isCorrect ? 1 : 0,
    nextReviewAtFor(nextMastery),
    nextDifficulty
  );
  const row = getMasteryRecord(db, input.userId, tag);
  if (!row) throw new Error('applyMasteryUpdate 后查询失败');
  return row;
}

export function listMasteryRecords(
  db: Db,
  userId: number,
  limit = 20
): MasteryRecordDTO[] {
  const rows = db
    .prepare<[number, number], MasteryRecordRow>(
      `SELECT * FROM mastery_records
       WHERE user_id = ?
       ORDER BY updated_at DESC, mastery_score ASC, attempts_count DESC
       LIMIT ?`
    )
    .all(userId, limit);
  return rows.map(rowToDTO);
}
