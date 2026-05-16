import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillEvent } from '@shared/skill';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  openStream: vi.fn(),
}));

vi.mock('../../api/chat.js', () => ({
  chatApi: {
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getMessages: vi.fn(),
    send: mocks.send,
  },
}));

vi.mock('../../api/sse.js', () => ({
  openStream: mocks.openStream,
}));

import { useAuthStore } from '../../stores/auth.js';
import { useChatStore } from '../../stores/chat.js';

function event(
  type: SkillEvent['type'],
  payload: SkillEvent['payload'],
  seq: number
): SkillEvent {
  return {
    type,
    payload,
    seq,
    streamId: 'stream-test',
    timestamp: Date.now(),
  } as SkillEvent;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('chat store streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ token: 'token-test' });
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      messages: [],
      streamingMessageId: null,
      streamBuffer: {},
      activeWidgets: {},
      inputMode: 'chat',
      isLoading: false,
      error: null,
    });
  });

  it('stream done 后保留 assistant 消息内容', async () => {
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 101,
      assistantMessageId: 102,
      streamId: 'stream-test',
      decision: {
        skillName: 'onboarding',
        params: {},
        confidence: 0.95,
        rationale: 'test',
      },
    });
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(event('text-chunk', { text: '嗨！我是 Echo。' }, 1));
      opts.onEvent(event('text-chunk', { text: ' 请问怎么称呼你呢？' }, 2));
      opts.onEvent(event('done', {}, 3));
      opts.onDone();
      return { close: vi.fn() };
    });

    await useChatStore.getState().sendMessage('hi');

    const state = useChatStore.getState();
    const assistant = state.messages.find((m) => m.id === 102);
    expect(assistant?.content).toBe('嗨！我是 Echo。 请问怎么称呼你呢？');
    expect(state.streamingMessageId).toBeNull();
    expect(state.streamBuffer[102]).toBeUndefined();
  });

  it('POST 返回前先插入用户消息和 assistant 思考占位', async () => {
    const pending = deferred<{
      conversationId: number;
      userMessageId: number;
      assistantMessageId: number;
      streamId: string;
      decision: {
        skillName: string;
        params: Record<string, unknown>;
        confidence: number;
        rationale: string;
      };
    }>();
    mocks.send.mockReturnValue(pending.promise);
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(event('done', {}, 1));
      opts.onDone();
      return { close: vi.fn() };
    });

    const sendPromise = useChatStore.getState().sendMessage('hello');

    let state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({
      role: 'user',
      content: 'hello',
    });
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
    });
    expect(state.streamingMessageId).toBe(state.messages[1].id);

    pending.resolve({
      conversationId: 10,
      userMessageId: 301,
      assistantMessageId: 302,
      streamId: 'stream-test',
      decision: {
        skillName: 'general-chat',
        params: {},
        confidence: 0.95,
        rationale: 'test',
      },
    });
    await sendPromise;

    state = useChatStore.getState();
    expect(state.messages[0].id).toBe(301);
    expect(state.messages[1].id).toBe(302);
  });

  it('action 消息使用自然文案,并在流式期间挂载 widgetSnapshot', async () => {
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 201,
      assistantMessageId: 202,
      streamId: 'stream-test',
      decision: {
        skillName: 'scene-select',
        params: {},
        confidence: 0.95,
        rationale: 'test',
      },
    });
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(
        event(
          'widget-init',
          {
            widget: {
              id: 'scene-cards-1',
              type: 'scene-cards',
              status: 'loading',
              data: {},
              version: 1,
            },
          },
          1
        )
      );
      opts.onEvent(
        event(
          'widget-ready',
          {
            widgetId: 'scene-cards-1',
            patch: {
              status: 'ready',
              data: {
                cards: [
                  {
                    id: 'cafe',
                    title: '咖啡店点单',
                    description: '练习点单',
                  },
                ],
              },
            },
          },
          2
        )
      );
      opts.onEvent(event('done', {}, 3));
      opts.onDone();
      return { close: vi.fn() };
    });

    await useChatStore
      .getState()
      .sendAction({ type: 'request-new-scenes' });

    const state = useChatStore.getState();
    const user = state.messages.find((m) => m.role === 'user');
    const assistant = state.messages.find((m) => m.role === 'assistant');
    expect(user?.content).toBe('换一批场景');
    expect(assistant?.widgetSnapshot).toMatchObject({
      id: 'scene-cards-1',
      type: 'scene-cards',
      status: 'ready',
      data: {
        cards: [
          {
            id: 'cafe',
            title: '咖啡店点单',
          },
        ],
      },
    });
  });

  it('submit-answer action 使用答案作为用户消息内容', async () => {
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 401,
      assistantMessageId: 402,
      streamId: 'stream-test',
      decision: {
        skillName: 'grade',
        params: {},
        confidence: 1,
        rationale: 'test',
      },
    });
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(event('done', {}, 1));
      opts.onDone();
      return { close: vi.fn() };
    });

    await useChatStore.getState().sendAction({
      type: 'submit-answer',
      payload: { attemptId: 9, answer: 'A cup of water, please.' },
    });

    const user = useChatStore
      .getState()
      .messages.find((m) => m.role === 'user');
    expect(user?.content).toBe('A cup of water, please.');
  });
});
