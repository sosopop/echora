/**
 * 会话域服务
 *
 * 封装 conversations 表的 CRUD 与 learning_state 转移。
 * SQL 全部在此层,路由不直接写 SQL。
 */

import type { Db } from '../db/connect.js';
import type {
  ConversationDTO,
} from '../../shared/api.js';
import type { LearningState, InputMode } from '../../shared/skill.js';

interface ConversationRow {
  id: number;
  user_id: number;
  title: string | null;
  status: 'active' | 'archived';
  learning_state: LearningState;
  active_skill: string | null;
  input_mode: InputMode;
  lock_policy: 'open' | 'locked';
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function toDTO(row: ConversationRow): ConversationDTO {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    learningState: row.learning_state,
    activeSkill: row.active_skill,
    inputMode: row.input_mode,
    lockPolicy: row.lock_policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function lockPolicyForLearningState(
  state: LearningState
): 'open' | 'locked' {
  return state === 'practicing' || state === 'grading' ? 'locked' : 'open';
}

export function createConversation(
  db: Db,
  userId: number,
  opts?: { title?: string; learningState?: LearningState }
): ConversationDTO {
  const learningState = opts?.learningState ?? 'onboarding';
  const stmt = db.prepare(
    `INSERT INTO conversations (user_id, title, learning_state, lock_policy)
     VALUES (?, ?, ?, ?)`
  );
  const result = stmt.run(
    userId,
    opts?.title ?? null,
    learningState,
    lockPolicyForLearningState(learningState)
  );
  const row = db
    .prepare<[number], ConversationRow>(
      'SELECT * FROM conversations WHERE id = ?'
    )
    .get(Number(result.lastInsertRowid));
  if (!row) throw new Error('createConversation 后查询失败');
  return toDTO(row);
}

export function getConversation(
  db: Db,
  id: number,
  userId: number
): ConversationDTO | null {
  const row = db
    .prepare<[number, number], ConversationRow>(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    )
    .get(id, userId);
  return row ? toDTO(row) : null;
}

export function listConversations(
  db: Db,
  userId: number,
  limit = 50
): ConversationDTO[] {
  const rows = db
    .prepare<[number, number], ConversationRow>(
      `SELECT * FROM conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(userId, limit);
  return rows.map(toDTO);
}

export function updateLearningState(
  db: Db,
  id: number,
  next: LearningState,
  activeSkill?: string | null
): void {
  db.prepare(
    `UPDATE conversations
     SET learning_state = ?, active_skill = ?, lock_policy = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(next, activeSkill ?? null, lockPolicyForLearningState(next), id);
}

export function updateInputMode(
  db: Db,
  id: number,
  mode: InputMode
): void {
  db.prepare(
    `UPDATE conversations
     SET input_mode = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(mode, id);
}

export function archiveConversation(db: Db, id: number): void {
  db.prepare(
    `UPDATE conversations
     SET status = 'archived',
         learning_state = 'archived',
         active_skill = NULL,
         lock_policy = 'open',
         archived_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);
}
