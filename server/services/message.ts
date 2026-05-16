/**
 * 消息域服务
 *
 * 持久化用户消息与 assistant 消息,以及流事件追加。
 * stream_events 字段以 JSON array 形态累积 SkillEvent 序列(支持回放)。
 */

import type { Db } from '../db/connect.js';
import type { MessageDTO } from '../../shared/api.js';
import type { SkillEvent } from '../../shared/skill.js';

interface MessageRow {
  id: number;
  conversation_id: number;
  type: 'text' | 'widget' | 'system';
  role: 'user' | 'assistant' | 'system';
  skill_name: string | null;
  content: string | null;
  widget_snapshot: string | null;
  stream_events: string | null;
  seq: number;
  created_at: string;
}

function toDTO(row: MessageRow): MessageDTO {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    type: row.type,
    role: row.role,
    skillName: row.skill_name,
    content: row.content,
    widgetSnapshot: row.widget_snapshot ? safeParse(row.widget_snapshot) : null,
    seq: row.seq,
    createdAt: row.created_at,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function nextSeq(db: Db, conversationId: number): number {
  const row = db
    .prepare<[number], { max_seq: number | null }>(
      'SELECT MAX(seq) AS max_seq FROM messages WHERE conversation_id = ?'
    )
    .get(conversationId);
  return (row?.max_seq ?? 0) + 1;
}

export interface AppendMessageInput {
  conversationId: number;
  type: 'text' | 'widget' | 'system';
  role: 'user' | 'assistant' | 'system';
  skillName?: string | null;
  content?: string | null;
}

export function appendMessage(db: Db, input: AppendMessageInput): MessageDTO {
  const seq = nextSeq(db, input.conversationId);
  const result = db
    .prepare(
      `INSERT INTO messages
       (conversation_id, type, role, skill_name, content, stream_events, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.conversationId,
      input.type,
      input.role,
      input.skillName ?? null,
      input.content ?? null,
      '[]', // 空流事件
      seq
    );
  const row = db
    .prepare<[number], MessageRow>('SELECT * FROM messages WHERE id = ?')
    .get(Number(result.lastInsertRowid));
  if (!row) throw new Error('appendMessage 后查询失败');
  return toDTO(row);
}

export function getMessages(
  db: Db,
  conversationId: number,
  limit = 200
): MessageDTO[] {
  const rows = db
    .prepare<[number, number], MessageRow>(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY seq ASC
       LIMIT ?`
    )
    .all(conversationId, limit);
  return rows.map(toDTO);
}

/**
 * 把一条 SkillEvent 追加到 messages.stream_events JSON 数组,
 * 同时维护 content(text-chunk 累积)与 widget_snapshot(widget-* 最终态)。
 */
export function appendStreamEvent(
  db: Db,
  messageId: number,
  event: SkillEvent
): void {
  const row = db
    .prepare<[number], MessageRow>('SELECT * FROM messages WHERE id = ?')
    .get(messageId);
  if (!row) throw new Error(`messages.${messageId} 不存在`);

  const events = (safeParse(row.stream_events ?? '[]') as SkillEvent[]) ?? [];
  events.push(event);

  let nextContent = row.content;
  let nextWidgetSnapshot = row.widget_snapshot;

  if (event.type === 'text-chunk') {
    nextContent = (nextContent ?? '') + event.payload.text;
  } else if (event.type === 'widget-init') {
    nextWidgetSnapshot = JSON.stringify(event.payload.widget);
  } else if (event.type === 'widget-update' || event.type === 'widget-ready') {
    const prev = nextWidgetSnapshot
      ? (safeParse(nextWidgetSnapshot) as Record<string, unknown>)
      : {};
    const merged = { ...prev, ...event.payload.patch };
    nextWidgetSnapshot = JSON.stringify(merged);
  }

  db.prepare(
    `UPDATE messages
     SET stream_events = ?, content = ?, widget_snapshot = ?
     WHERE id = ?`
  ).run(JSON.stringify(events), nextContent, nextWidgetSnapshot, messageId);
}
