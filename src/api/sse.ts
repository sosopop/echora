/**
 * SSE 流封装
 *
 * V1 用浏览器原生 EventSource。token 通过 ?token= 查询参数传(EventSource
 * 不支持自定义 header)。生产化前迁移到 fetch + ReadableStream。
 *
 * 支持 lastSeq 续传:每收到一条事件就更新内部 lastSeq,断线重连用最新值。
 */

import { getApiBaseUrl } from './client.js';
import type { SkillEvent } from '@shared/skill';

interface OpenStreamOptions {
  token: string;
  onEvent: (event: SkillEvent) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

interface OpenStreamHandle {
  close(): void;
}

const RECONNECT_DELAYS = [1000, 3000, 8000];

export function openStream(
  streamId: string,
  opts: OpenStreamOptions
): OpenStreamHandle {
  let lastSeq = 0;
  let attempt = 0;
  let closed = false;
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const open = (): void => {
    if (closed) return;
    const base = getApiBaseUrl();
    const url = `${base}/chat/stream?streamId=${encodeURIComponent(
      streamId
    )}&lastSeq=${lastSeq}&token=${encodeURIComponent(opts.token)}`;
    es = new EventSource(url);

    es.onmessage = (msgEvt) => {
      try {
        const evt = JSON.parse(msgEvt.data) as SkillEvent;
        if (typeof evt.seq === 'number') lastSeq = Math.max(lastSeq, evt.seq);
        opts.onEvent(evt);
        if (evt.type === 'done') {
          opts.onDone?.();
          close();
        } else if (evt.type === 'error') {
          opts.onError?.(formatSkillError(evt));
          close();
        }
      } catch (e) {
        opts.onError?.(e as Error);
      }
    };

    es.onerror = () => {
      if (closed) return;
      es?.close();
      es = null;
      const delay =
        RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      attempt += 1;
      if (attempt > RECONNECT_DELAYS.length) {
        opts.onError?.(new Error('SSE 连接失败,已放弃重连'));
        return;
      }
      reconnectTimer = setTimeout(open, delay);
    };
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    es?.close();
    es = null;
  };

  open();
  return { close };
}

function formatSkillError(evt: Extract<SkillEvent, { type: 'error' }>): Error {
  const detailText =
    import.meta.env.DEV && evt.payload.details
      ? `\n${JSON.stringify(evt.payload.details, null, 2)}`
      : '';
  if (import.meta.env.DEV) {
    console.error('[sse] skill error', evt.payload);
  }
  return new Error(`${evt.payload.code}: ${evt.payload.message}${detailText}`);
}
