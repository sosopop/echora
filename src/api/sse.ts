/**
 * SSE 流封装
 *
 * 使用 fetch + ReadableStream 读取 text/event-stream,因此 token 可以走
 * Authorization header,不会再暴露在 URL 查询参数中。
 *
 * 支持 Last-Event-ID 续传:每收到一条事件就更新内部 lastSeq,断线重连用
 * 标准 header 请求服务端回放。
 */

import { getApiBaseUrl } from './client.js';
import type { SkillEvent } from '@shared/skill';

interface OpenStreamOptions {
  token: string;
  onEvent: (event: SkillEvent) => void;
  onDone?: () => void;
  onError?: (
    err: Error,
    info?: { kind: 'skill' | 'transport' }
  ) => void;
}

export interface OpenStreamHandle {
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
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const open = (): void => {
    if (closed) return;
    const base = getApiBaseUrl();
    const url = `${base}/chat/stream?streamId=${encodeURIComponent(
      streamId
    )}`;
    controller = new AbortController();
    void readStream(url, controller.signal).catch((err) => {
      if (closed || isAbortError(err)) return;
      const delay =
        RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      attempt += 1;
      if (attempt > RECONNECT_DELAYS.length) {
        opts.onError?.(new Error('SSE 连接失败,已放弃重连'), {
          kind: 'transport',
        });
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
    });
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    controller?.abort();
    controller = null;
  };

  const readStream = async (url: string, signal: AbortSignal): Promise<void> => {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${opts.token}`,
        ...(lastSeq > 0 ? { 'Last-Event-ID': String(lastSeq) } : {}),
      },
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`SSE 连接失败:HTTP ${res.status}`);
    }
    attempt = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawTerminal = false;
    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const data = parseSseData(part);
          if (!data) continue;
          const evt = JSON.parse(data) as SkillEvent;
          if (typeof evt.seq === 'number') {
            lastSeq = Math.max(lastSeq, evt.seq);
          }
          opts.onEvent(evt);
          if (evt.type === 'done') {
            sawTerminal = true;
            opts.onDone?.();
            close();
            return;
          }
          if (evt.type === 'error') {
            sawTerminal = true;
            opts.onError?.(formatSkillError(evt), { kind: 'skill' });
            close();
            return;
          }
        }
      }
      if (!closed && !sawTerminal) {
        throw new Error('SSE 连接中断');
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* reader already closed */
      }
      if (controller?.signal === signal) {
        controller = null;
      }
    }
  };

  open();
  return { close };
}

function parseSseData(block: string): string | null {
  const lines = block
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
    .filter((line) => line.startsWith('data:'));
  if (lines.length === 0) return null;
  return lines
    .map((line) => {
      const raw = line.slice('data:'.length);
      return raw.startsWith(' ') ? raw.slice(1) : raw;
    })
    .join('\n');
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'AbortError'
  );
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
