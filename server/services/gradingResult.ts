/**
 * 批改结果(grading_results 表)服务
 */

import type { Db } from '../db/connect.js';

export interface GradingCorrections {
  referenceAnswer?: string;
  explanation?: string;
  diff?: Array<{ kind: 'add' | 'remove' | 'equal'; text: string }>;
  tags?: string[];
}

export interface GradingResultDTO {
  id: number;
  attemptId: number;
  score: number;
  isCorrect: boolean;
  corrections: GradingCorrections;
  createdAt: string;
}

interface GradingResultRow {
  id: number;
  attempt_id: number;
  score: number;
  is_correct: number;
  corrections: string | null;
  created_at: string;
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

function rowToDTO(row: GradingResultRow): GradingResultDTO {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    score: row.score,
    isCorrect: row.is_correct === 1,
    corrections: safeParseCorrections(row.corrections),
    createdAt: row.created_at,
  };
}

export interface CreateGradingInput {
  attemptId: number;
  score: number;
  isCorrect: boolean;
  corrections: GradingCorrections;
}

export function createGrading(
  db: Db,
  input: CreateGradingInput
): GradingResultDTO {
  // attempt_id UNIQUE,重批改用 UPSERT(同一题重试时覆盖原 grading)
  const result = db
    .prepare(
      `INSERT INTO grading_results
       (attempt_id, score, is_correct, corrections)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(attempt_id) DO UPDATE SET
         score = excluded.score,
         is_correct = excluded.is_correct,
         corrections = excluded.corrections`
    )
    .run(
      input.attemptId,
      input.score,
      input.isCorrect ? 1 : 0,
      JSON.stringify(input.corrections)
    );
  // 取回(INSERT 或 UPDATE 后 attempt_id 必有一行)
  const row = db
    .prepare<[number], GradingResultRow>(
      'SELECT * FROM grading_results WHERE attempt_id = ?'
    )
    .get(input.attemptId);
  if (!row) throw new Error('createGrading 后查询失败');
  // 标注未使用变量
  void result;
  return rowToDTO(row);
}

export function getGradingByAttempt(
  db: Db,
  attemptId: number
): GradingResultDTO | null {
  const row = db
    .prepare<[number], GradingResultRow>(
      'SELECT * FROM grading_results WHERE attempt_id = ?'
    )
    .get(attemptId);
  return row ? rowToDTO(row) : null;
}
