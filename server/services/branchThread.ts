/**
 * 辅助追问支线服务
 *
 * branch_threads 只记录支线元信息,实际聊天消息仍复用 messages,
 * 通过 messages.branch_thread_id 与主学习流隔离。
 */

import type { Db } from '../db/connect.js';
import type { BranchThreadDTO } from '../../shared/api.js';

interface BranchThreadRow {
  id: number;
  user_id: number;
  conversation_id: number;
  source_message_id: number;
  source_ref: string | null;
  status: 'open' | 'closed';
  created_at: string;
}

export interface CreateBranchThreadInput {
  userId: number;
  conversationId: number;
  sourceMessageId: number;
  sourceRef?: unknown;
}

function toDTO(row: BranchThreadRow): BranchThreadDTO {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    sourceMessageId: row.source_message_id,
    sourceRef: row.source_ref ? safeParse(row.source_ref) : null,
    status: row.status,
    createdAt: row.created_at,
  };
}

function safeParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeSourceRef(sourceRef: unknown): string | null {
  if (sourceRef == null) return null;
  return JSON.stringify(sourceRef);
}

export function createBranchThread(
  db: Db,
  input: CreateBranchThreadInput
): BranchThreadDTO {
  const result = db
    .prepare(
      `INSERT INTO branch_threads
       (user_id, conversation_id, source_message_id, source_ref, status)
       VALUES (?, ?, ?, ?, 'open')`
    )
    .run(
      input.userId,
      input.conversationId,
      input.sourceMessageId,
      serializeSourceRef(input.sourceRef)
    );
  const row = db
    .prepare<[number], BranchThreadRow>(
      'SELECT * FROM branch_threads WHERE id = ?'
    )
    .get(Number(result.lastInsertRowid));
  if (!row) throw new Error('createBranchThread 后查询失败');
  return toDTO(row);
}

export function getBranchThread(
  db: Db,
  threadId: number,
  userId: number
): BranchThreadDTO | null {
  const row = db
    .prepare<[number, number], BranchThreadRow>(
      'SELECT * FROM branch_threads WHERE id = ? AND user_id = ?'
    )
    .get(threadId, userId);
  return row ? toDTO(row) : null;
}

export function listBranchThreads(
  db: Db,
  conversationId: number,
  userId: number
): BranchThreadDTO[] {
  const rows = db
    .prepare<[number, number], BranchThreadRow>(
      `SELECT * FROM branch_threads
       WHERE conversation_id = ? AND user_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(conversationId, userId);
  return rows.map(toDTO);
}
