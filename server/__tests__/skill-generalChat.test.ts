/**
 * general-chat skill 单测
 *
 *   - 默认低风险闲聊仍输出自然文本
 *   - 有 provider.chat + userText → 使用真实流式文本
 *   - intentConfirm 参数 → 输出 intent-confirm widget
 */

import { describe, it, expect } from '@jest/globals';
import { generalChatSkill } from '../skills/generalChat.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider, ChatRequest, ChatStreamEvent } from '../ai/types.js';
import type { SkillEventInput } from '../../shared/skill.js';

const provider: AIProvider = {
  name: 'general-chat-test',
  async route() {
    throw new Error('not used');
  },
};

function makeCtx(
  params: Record<string, unknown> = {},
  providerOverride: AIProvider = provider
): ServerSkillContext {
  return {
    user: { id: 1, email: 'g@test.com' },
    conversationId: 1,
    messageId: 1,
    streamId: 'general-chat-stream',
    params,
    learningState: 'scene_selecting',
    signal: new AbortController().signal,
    provider: providerOverride,
    db: {} as ServerSkillContext['db'],
    emit() {},
    makeWidgetId(p) {
      return `${p}-test`;
    },
  };
}

async function collect(
  params: Record<string, unknown> = {},
  providerOverride?: AIProvider
): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of generalChatSkill.handler(
    makeCtx(params, providerOverride ?? provider)
  )) {
    out.push(ev);
  }
  return out;
}

describe('general-chat skill', () => {
  it('默认输出低风险闲聊提示', async () => {
    const events = await collect();
    const text = events
      .filter((ev) => ev.type === 'text-chunk')
      .map((ev) => ev.payload.text)
      .join('');

    expect(text).toContain('开始练习');
    expect(events.some((ev) => ev.type === 'widget-init')).toBe(false);
  });

  it('有 provider.chat + userText 时输出真实流式文本', async () => {
    let seenRequest: ChatRequest | null = null;
    const chatProvider: AIProvider = {
      name: 'chat-provider',
      async route() {
        throw new Error('not used');
      },
      async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
        seenRequest = req;
        yield { type: 'text-delta', text: '当然可以,' };
        yield { type: 'text-delta', text: '我们可以从咖啡店点单开始。' };
        yield { type: 'message-stop', stopReason: 'end_turn' };
      },
    };

    const events = await collect({ userText: '随便聊聊' }, chatProvider);
    const text = events
      .filter((ev) => ev.type === 'text-chunk')
      .map((ev) => ev.payload.text)
      .join('');

    expect(text).toBe('当然可以,我们可以从咖啡店点单开始。');
    expect(seenRequest?.messages[0]).toEqual({
      role: 'user',
      content: '随便聊聊',
    });
    expect(events.at(-1)?.type).toBe('done');
  });

  it('provider.chat 抛错时显式返回 GENERAL_CHAT_FAILED', async () => {
    const chatProvider: AIProvider = {
      name: 'broken-chat-provider',
      async route() {
        throw new Error('not used');
      },
      async *chat(): AsyncIterable<ChatStreamEvent> {
        throw new Error('provider down');
      },
    };

    const events = await collect({ userText: 'hello' }, chatProvider);
    const err = events.find((ev) => ev.type === 'error') as
      | { payload: { code: string; message: string } }
      | undefined;

    expect(err?.payload.code).toBe('GENERAL_CHAT_FAILED');
    expect(err?.payload.message).toContain('provider down');
  });

  it('intentConfirm 参数输出 intent-confirm widget', async () => {
    const events = await collect({
      intentConfirm: {
        question: '你想让我怎么处理?',
        prompt: '换一个',
        choices: [
          {
            id: 'new-scenes',
            title: '换一批场景',
            desc: '重新生成场景',
            action: 'action:request-new-scenes',
          },
          {
            id: 'review',
            title: '看复盘',
            desc: '查看总结',
            action: 'text:复盘',
          },
        ],
      },
    });
    const ready = events.find((ev) => ev.type === 'widget-ready');

    expect(
      events
        .filter((ev) => ev.type === 'text-chunk')
        .map((ev) => ev.payload.text)
        .join('')
    ).toContain('换一个');
    expect(ready?.payload.patch).toMatchObject({
      status: 'ready',
      data: {
        question: '你想让我怎么处理?',
        choices: [
          { id: 'new-scenes', title: '换一批场景' },
          { id: 'review', title: '看复盘' },
        ],
      },
    });
  });
});
