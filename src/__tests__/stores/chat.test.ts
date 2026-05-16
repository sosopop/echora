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
});
