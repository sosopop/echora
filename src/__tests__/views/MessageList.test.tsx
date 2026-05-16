import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import MessageList from '../../views/Chat/MessageList';
import { useChatStore } from '../../stores/chat';

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2400,
  });
  window.scrollTo = vi.fn();
  useChatStore.setState({
    conversations: [],
    currentConversationId: 1,
    messages: [
      {
        id: 1,
        conversationId: 1,
        type: 'text',
        role: 'assistant',
        skillName: 'scene-select',
        content: '准备场景',
        widgetSnapshot: null,
        seq: 1,
        createdAt: new Date().toISOString(),
      },
    ],
    streamingMessageId: 1,
    streamBuffer: {},
    activeWidgets: {},
    inputMode: 'chat',
    isLoading: false,
    error: null,
  });
});

describe('MessageList scrolling', () => {
  it('消息列表渲染后滚动到文档底部', async () => {
    render(<MessageList />);

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ top: 2400 })
      );
    });
  });

  it('widget 展开更新后再次滚动到底部', async () => {
    const { rerender } = render(<MessageList />);
    vi.mocked(window.scrollTo).mockClear();

    act(() => {
      useChatStore.setState({
        activeWidgets: {
          'scene-cards-1': {
            id: 'scene-cards-1',
            type: 'scene-cards',
            status: 'ready',
            data: {
              cards: [{ id: 'cafe', title: '咖啡店', description: '点单' }],
            },
            version: 1,
          },
        },
        messages: [
          {
            id: 1,
            conversationId: 1,
            type: 'text',
            role: 'assistant',
            skillName: 'scene-select',
            content: '准备场景',
            widgetSnapshot: {
              id: 'scene-cards-1',
              type: 'scene-cards',
              status: 'ready',
              data: {
                cards: [{ id: 'cafe', title: '咖啡店', description: '点单' }],
              },
              version: 1,
            },
            seq: 1,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });
    rerender(<MessageList />);

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ top: 2400 })
      );
    });
  });
});
