import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        branchThreadId: null,
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
            branchThreadId: null,
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

  it('同一条消息可渲染多个 widget snapshot', () => {
    useChatStore.setState({
      streamingMessageId: null,
      messages: [
        {
          id: 2,
          conversationId: 1,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'review',
          content: '本轮复盘来了',
          widgetSnapshot: [
            {
              id: 'summary-1',
              type: 'progress-summary',
              status: 'ready',
              data: {
                title: '餐厅点餐 · 已经达标',
                sceneName: '餐厅点餐',
                questionsCount: 2,
                averageScore: 86,
              },
              version: 1,
            },
            {
              id: 'answer-review-1',
              type: 'answer-review',
              status: 'ready',
              data: {
                title: '餐厅点餐 · 2 道题回看',
                items: [
                  {
                    questionNo: 1,
                    promptShort: 'Fill the blank.',
                    questionType: 'fill_word',
                    score: 90,
                    status: 'ok',
                    tags: [],
                  },
                ],
              },
              version: 1,
            },
          ],
          seq: 1,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<MessageList />);

    expect(screen.getByText('餐厅点餐 · 已经达标')).toBeInTheDocument();
    expect(screen.getByText('餐厅点餐 · 2 道题回看')).toBeInTheDocument();
  });

  it('普通消息不显示追问,批改卡片追问会携带题目和解析上下文', () => {
    const openBranchForWidget = vi.fn();
    useChatStore.setState({
      openBranchForWidget,
      streamingMessageId: null,
      messages: [
        {
          id: 1,
          conversationId: 1,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'practice',
          content: '请完成这一题',
          widgetSnapshot: {
            id: 'exercise-1',
            type: 'exercise-card',
            status: 'ready',
            data: {
              attemptId: 9,
              stage: 3,
              questionNo: 1,
              questionType: 'dialogue_chain',
              contextZh: '你和朋友约打牌。',
              contextEn: 'Friend: Do you want to play cards?',
              targetZh: '问对方要不要玩纸牌。',
              inputMode: 'chat',
            },
            version: 1,
          },
          seq: 1,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          conversationId: 1,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'grade',
          content: '正在批改...',
          widgetSnapshot: {
            id: 'grading-1',
            type: 'grading-result',
            status: 'ready',
            data: {
              attemptId: 9,
              score: 40,
              isCorrect: false,
              category: 'incorrect',
              userAnswer: 'How about play card game?',
              referenceAnswer: 'How about a card game?',
              explanation: '"How about" 后面需要接名词或动名词。',
              tags: ['collocation', 'missing_word'],
            },
            version: 1,
          },
          seq: 2,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<MessageList />);

    fireEvent.click(screen.getByRole('button', { name: '追问' }));
    expect(openBranchForWidget).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        kind: 'grading-result',
        messageId: 2,
        widgetId: 'grading-1',
        attemptId: 9,
        scenarioContext: expect.stringContaining('你和朋友约打牌。'),
        aiQuestion: expect.stringContaining('对话接龙'),
        myAnswer: 'How about play card game?',
        referenceAnswer: 'How about a card game?',
        aiAnalysis: '"How about" 后面需要接名词或动名词。',
        tags: ['collocation', 'missing_word'],
      })
    );
  });
});
