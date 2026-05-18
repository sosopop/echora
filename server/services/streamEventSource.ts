/**
 * SSE stream 事件源
 *
 * `streamBus` 只负责本进程低延迟分发;跨实例恢复以
 * messages.stream_events 为权威事件源。
 */

import type { Db } from '../db/connect.js';
import type { SkillEvent } from '../../shared/skill.js';
import { getMessageStreamEvents } from './message.js';

const STREAM_ID_RE = /^stream-(\d+)-[A-Za-z0-9]+$/;

export interface StreamEventSource {
  streamId: string;
  messageId: number;
  conversationId: number;
}

export function extractStreamMessageId(streamId: string): number | null {
  const match = STREAM_ID_RE.exec(streamId);
  if (!match) return null;
  const messageId = Number(match[1]);
  return Number.isInteger(messageId) && messageId > 0 ? messageId : null;
}

export function resolveStreamEventSource(
  db: Db,
  streamId: string,
  userId: number
): StreamEventSource | null {
  const messageId = extractStreamMessageId(streamId);
  if (!messageId) return null;

  const row = db
    .prepare<
      [number, number],
      { id: number; conversation_id: number }
    >(
      `SELECT m.id, m.conversation_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = ? AND c.user_id = ? AND m.role = 'assistant'
       LIMIT 1`
    )
    .get(messageId, userId);

  return row
    ? {
        streamId,
        messageId: row.id,
        conversationId: row.conversation_id,
      }
    : null;
}

export function getPersistedStreamEventsAfter(
  db: Db,
  source: StreamEventSource,
  lastSeq: number
): SkillEvent[] {
  return getMessageStreamEvents(db, source.messageId).filter(
    (event) => event.streamId === source.streamId && event.seq > lastSeq
  );
}
