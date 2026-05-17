/**
 * 练习索引(exercise_attempts 表)服务
 *
 * 关键字段:
 *   - status: pending(刚创建,等用户作答)
 *           / submitted(用户已答,等批改)
 *           / graded(已批改)
 *           / needs_review(单题 2 次未通过,标记复盘)
 *           / abandoned(用户主动跳过)
 *   - stage: 1..4(PRD §2.6 4 阶段)
 *   - question_no: 同阶段内题号
 *   - retry_count: 0..2(PRD §2.6 单题最多 2 次原题重试)
 */

import type { Db } from '../db/connect.js';

export type AttemptStatus =
  | 'pending'
  | 'submitted'
  | 'graded'
  | 'needs_review'
  | 'abandoned';

export interface ExerciseAttemptDTO {
  id: number;
  conversationId: number;
  messageId: number | null;
  sceneId: string | null;
  stage: number;
  questionNo: number;
  questionType: string;
  prompt: string;
  userAnswer: string | null;
  status: AttemptStatus;
  retryCount: number;
  difficultyScore: number;
  createdAt: string;
  submittedAt: string | null;
}

interface ExerciseAttemptRow {
  id: number;
  conversation_id: number;
  message_id: number | null;
  scene_id: string | null;
  stage: number;
  question_no: number;
  question_type: string;
  prompt: string;
  user_answer: string | null;
  status: AttemptStatus;
  retry_count: number;
  difficulty_score: number;
  created_at: string;
  submitted_at: string | null;
}

function rowToDTO(row: ExerciseAttemptRow): ExerciseAttemptDTO {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    sceneId: row.scene_id,
    stage: row.stage,
    questionNo: row.question_no,
    questionType: row.question_type,
    prompt: row.prompt,
    userAnswer: row.user_answer,
    status: row.status,
    retryCount: row.retry_count,
    difficultyScore: row.difficulty_score,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
  };
}

export interface CreateAttemptInput {
  conversationId: number;
  messageId?: number | null;
  sceneId: string;
  stage: number;
  questionNo: number;
  questionType: string;
  prompt: string;
}

export function createAttempt(
  db: Db,
  input: CreateAttemptInput
): ExerciseAttemptDTO {
  const result = db
    .prepare(
      `INSERT INTO exercise_attempts
       (conversation_id, message_id, scene_id, stage, question_no, question_type, prompt, status, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`
    )
    .run(
      input.conversationId,
      input.messageId ?? null,
      input.sceneId,
      input.stage,
      input.questionNo,
      input.questionType,
      input.prompt
    );
  return getAttempt(db, Number(result.lastInsertRowid))!;
}

export function getAttempt(
  db: Db,
  attemptId: number
): ExerciseAttemptDTO | null {
  const row = db
    .prepare<[number], ExerciseAttemptRow>(
      'SELECT * FROM exercise_attempts WHERE id = ?'
    )
    .get(attemptId);
  return row ? rowToDTO(row) : null;
}

/**
 * 当前会话最新一个未 graded 的 attempt,或 status=graded 但 retry_count<2
 * 且 is_correct=0 的(可再次提交)。MVP 简化:直接取最新行,由调用方判断 status。
 */
export function findLatestAttempt(
  db: Db,
  conversationId: number,
  sceneId?: string | null
): ExerciseAttemptDTO | null {
  if (sceneId) {
    const row = db
      .prepare<[number, string], ExerciseAttemptRow>(
        `SELECT * FROM exercise_attempts
         WHERE conversation_id = ?
           AND scene_id = ?
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(conversationId, sceneId);
    return row ? rowToDTO(row) : null;
  }
  const row = db
    .prepare<[number], ExerciseAttemptRow>(
      `SELECT * FROM exercise_attempts
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(conversationId);
  return row ? rowToDTO(row) : null;
}

export function markSubmitted(
  db: Db,
  attemptId: number,
  userAnswer: string
): void {
  db.prepare(
    `UPDATE exercise_attempts
     SET user_answer = ?, status = 'submitted', submitted_at = datetime('now')
     WHERE id = ?`
  ).run(userAnswer, attemptId);
}

export function markGraded(db: Db, attemptId: number): void {
  db.prepare(
    `UPDATE exercise_attempts SET status = 'graded' WHERE id = ?`
  ).run(attemptId);
}

export function incrementRetry(db: Db, attemptId: number): number {
  db.prepare(
    `UPDATE exercise_attempts SET retry_count = retry_count + 1 WHERE id = ?`
  ).run(attemptId);
  const row = db
    .prepare<[number], { retry_count: number }>(
      'SELECT retry_count FROM exercise_attempts WHERE id = ?'
    )
    .get(attemptId);
  return row?.retry_count ?? 0;
}

export function markNeedsReview(db: Db, attemptId: number): void {
  db.prepare(
    `UPDATE exercise_attempts SET status = 'needs_review' WHERE id = ?`
  ).run(attemptId);
}

/**
 * 统计当前会话当前阶段已通过的题数(graded + is_correct=1)。
 */
export function countStagePassed(
  db: Db,
  conversationId: number,
  stage: number,
  sceneId?: string | null
): number {
  if (sceneId) {
    const row = db
      .prepare<[number, number, string], { c: number }>(
        `SELECT COUNT(*) AS c
         FROM exercise_attempts a
         JOIN grading_results g ON g.attempt_id = a.id
         WHERE a.conversation_id = ?
           AND a.stage = ?
           AND a.scene_id = ?
           AND g.is_correct = 1`
      )
      .get(conversationId, stage, sceneId);
    return row?.c ?? 0;
  }
  const row = db
    .prepare<[number, number], { c: number }>(
      `SELECT COUNT(*) AS c
       FROM exercise_attempts a
       JOIN grading_results g ON g.attempt_id = a.id
       WHERE a.conversation_id = ?
         AND a.stage = ?
         AND g.is_correct = 1`
    )
    .get(conversationId, stage);
  return row?.c ?? 0;
}

/**
 * 统计当前会话当前阶段已处理完的计分题数:
 *   - 批改正确的题
 *   - 已达重试上限并标记 needs_review 的题
 *
 * 该值用于推进出题序号,避免用户在同一题错两次后被永久卡住。
 */
export function countStageHandled(
  db: Db,
  conversationId: number,
  stage: number,
  sceneId?: string | null
): number {
  if (sceneId) {
    const row = db
      .prepare<[number, number, string], { c: number }>(
        `SELECT COUNT(*) AS c
         FROM exercise_attempts a
         LEFT JOIN grading_results g ON g.attempt_id = a.id
         WHERE a.conversation_id = ?
           AND a.stage = ?
           AND a.scene_id = ?
           AND (a.status = 'needs_review' OR g.is_correct = 1)`
      )
      .get(conversationId, stage, sceneId);
    return row?.c ?? 0;
  }
  const row = db
    .prepare<[number, number], { c: number }>(
      `SELECT COUNT(*) AS c
       FROM exercise_attempts a
       LEFT JOIN grading_results g ON g.attempt_id = a.id
       WHERE a.conversation_id = ?
         AND a.stage = ?
         AND (a.status = 'needs_review' OR g.is_correct = 1)`
    )
    .get(conversationId, stage);
  return row?.c ?? 0;
}

/**
 * 当前阶段最大 question_no(用于下一题编号)。
 */
export function maxQuestionNo(
  db: Db,
  conversationId: number,
  stage: number
): number {
  const row = db
    .prepare<[number, number], { m: number | null }>(
      `SELECT MAX(question_no) AS m
       FROM exercise_attempts
       WHERE conversation_id = ? AND stage = ?`
    )
    .get(conversationId, stage);
  return row?.m ?? 0;
}
