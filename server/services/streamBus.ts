/**
 * 内存 SSE 总线
 *
 * 每个 streamId 维护一个 ring buffer(最多 MAX_BUFFER 事件)+ 订阅者列表。
 * 订阅时若 lastSeq < 缓存末尾,先 replay 中间事件,然后挂回调。
 *
 * V1 单进程内存方案。后续可平滑替换为 Redis Streams。
 */

import type { SkillEvent } from '../../shared/skill.js';

const MAX_BUFFER = 200;

type Subscriber = (event: SkillEvent) => void;

interface Stream {
  events: SkillEvent[];
  subscribers: Set<Subscriber>;
  closed: boolean;
}

export class StreamBus {
  private streams = new Map<string, Stream>();

  private ensure(streamId: string): Stream {
    let s = this.streams.get(streamId);
    if (!s) {
      s = { events: [], subscribers: new Set(), closed: false };
      this.streams.set(streamId, s);
    }
    return s;
  }

  publish(streamId: string, event: SkillEvent): void {
    const s = this.ensure(streamId);
    if (s.closed) return;
    s.events.push(event);
    if (s.events.length > MAX_BUFFER) {
      s.events.splice(0, s.events.length - MAX_BUFFER);
    }
    for (const sub of s.subscribers) {
      try {
        sub(event);
      } catch (e) {
        console.warn('[StreamBus] subscriber 抛错', e);
      }
    }
  }

  subscribe(
    streamId: string,
    lastSeq: number,
    onEvent: Subscriber
  ): () => void {
    const s = this.ensure(streamId);

    // replay 缓存中 seq > lastSeq 的事件
    for (const evt of s.events) {
      if (evt.seq > lastSeq) {
        try {
          onEvent(evt);
        } catch (e) {
          console.warn('[StreamBus] replay 时 subscriber 抛错', e);
        }
      }
    }

    if (s.closed) {
      return () => {};
    }

    s.subscribers.add(onEvent);
    return () => {
      s.subscribers.delete(onEvent);
    };
  }

  close(streamId: string): void {
    const s = this.streams.get(streamId);
    if (!s) return;
    s.closed = true;
    s.subscribers.clear();
  }

  /** 测试用:清空全部 */
  clear(): void {
    this.streams.clear();
  }
}

/** 单例总线(进程内共享) */
export const streamBus = new StreamBus();
