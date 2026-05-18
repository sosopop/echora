import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStream } from './sse.js';
import type { SkillEvent } from '@shared/skill';

function streamFromText(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function sseEvent(event: SkillEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

describe('openStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('通过 Authorization header 读取 fetch SSE,不把 token 放入 URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: streamFromText(
        sseEvent({
          type: 'done',
          payload: {},
          seq: 1,
          streamId: 'stream-test',
          timestamp: 1,
        } as SkillEvent)
      ),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();

    openStream('stream-test', {
      token: 'token-test',
      onEvent: vi.fn(),
      onDone,
    });
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/stream?streamId=stream-test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer token-test',
        }),
      })
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('token-test');
    expect(onDone).toHaveBeenCalled();
  });

  it('传输中断重连时使用 Last-Event-ID 续传', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: streamFromText(
          sseEvent({
            type: 'text-chunk',
            payload: { text: 'hi' },
            seq: 7,
            streamId: 'stream-test',
            timestamp: 1,
          } as SkillEvent)
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: streamFromText(
          sseEvent({
            type: 'done',
            payload: {},
            seq: 8,
            streamId: 'stream-test',
            timestamp: 2,
          } as SkillEvent)
        ),
      }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();

    openStream('stream-test', {
      token: 'token-test',
      onEvent: vi.fn(),
      onDone,
    });
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Last-Event-ID': '7',
        }),
      })
    );
    expect(onDone).toHaveBeenCalled();
  });
});
