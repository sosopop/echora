/**
 * error_tag_events 表服务
 *
 * 批改结果中的错误标签会作为事件落库,供复盘与后续重练统计读取。
 */

import type { Db } from '../db/connect.js';
import { ErrorTagSchema } from '../../shared/widget.js';

export interface ErrorTagEventDTO {
  id: number;
  attemptId: number;
  gradingId: number;
  userId: number;
  tag: string;
  severity: 'low' | 'medium' | 'high';
  includedInStats: boolean;
  createdAt: string;
}

export interface ErrorTagSummaryDTO {
  tag: string;
  count: number;
  highCount: number;
  latestAt: string;
}

interface ErrorTagEventRow {
  id: number;
  attempt_id: number;
  grading_id: number;
  user_id: number;
  tag: string;
  severity: 'low' | 'medium' | 'high';
  included_in_stats: number;
  created_at: string;
}

interface ErrorTagSummaryRow {
  tag: string;
  count: number;
  high_count: number;
  latest_at: string;
}

function rowToDTO(row: ErrorTagEventRow): ErrorTagEventDTO {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    gradingId: row.grading_id,
    userId: row.user_id,
    tag: row.tag,
    severity: row.severity,
    includedInStats: row.included_in_stats === 1,
    createdAt: row.created_at,
  };
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || out.includes(tag)) continue;
    if (ErrorTagSchema.safeParse(tag).success) out.push(tag);
  }
  return out;
}

function severityForScore(score: number): 'low' | 'medium' | 'high' {
  if (score < 60) return 'high';
  if (score < 80) return 'medium';
  return 'low';
}

export interface CreateErrorTagEventsInput {
  attemptId: number;
  gradingId: number;
  userId: number;
  score: number;
  tags: string[];
}

export function createErrorTagEvents(
  db: Db,
  input: CreateErrorTagEventsInput
): ErrorTagEventDTO[] {
  const tags = normalizeTags(input.tags);
  if (tags.length === 0) return [];
  const severity = severityForScore(input.score);
  const stmt = db.prepare(
    `INSERT INTO error_tag_events
     (attempt_id, grading_id, user_id, tag, severity, included_in_stats)
     VALUES (?, ?, ?, ?, ?, 1)`
  );
  const ids = tags.map((tag) =>
    Number(
      stmt.run(input.attemptId, input.gradingId, input.userId, tag, severity)
        .lastInsertRowid
    )
  );
  const select = db.prepare<[number], ErrorTagEventRow>(
    'SELECT * FROM error_tag_events WHERE id = ?'
  );
  return ids
    .map((id) => select.get(id))
    .filter((row): row is ErrorTagEventRow => row != null)
    .map(rowToDTO);
}

export function listErrorTagSummaryByConversation(
  db: Db,
  conversationId: number,
  sceneId?: string | null
): ErrorTagSummaryDTO[] {
  const sql = sceneId
    ? `SELECT e.tag,
              COUNT(*) AS count,
              SUM(CASE WHEN e.severity = 'high' THEN 1 ELSE 0 END) AS high_count,
              MAX(e.created_at) AS latest_at
       FROM error_tag_events e
       JOIN exercise_attempts a ON a.id = e.attempt_id
       WHERE a.conversation_id = ?
         AND a.scene_id = ?
         AND e.included_in_stats = 1
       GROUP BY e.tag
       ORDER BY count DESC, high_count DESC, latest_at DESC`
    : `SELECT e.tag,
              COUNT(*) AS count,
              SUM(CASE WHEN e.severity = 'high' THEN 1 ELSE 0 END) AS high_count,
              MAX(e.created_at) AS latest_at
       FROM error_tag_events e
       JOIN exercise_attempts a ON a.id = e.attempt_id
       WHERE a.conversation_id = ?
         AND e.included_in_stats = 1
       GROUP BY e.tag
       ORDER BY count DESC, high_count DESC, latest_at DESC`;
  const rows = sceneId
    ? db
        .prepare<[number, string], ErrorTagSummaryRow>(sql)
        .all(conversationId, sceneId)
    : db.prepare<[number], ErrorTagSummaryRow>(sql).all(conversationId);
  return rows.map((row) => ({
    tag: row.tag,
    count: row.count,
    highCount: row.high_count,
    latestAt: row.latest_at,
  }));
}
