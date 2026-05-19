import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import BranchPanel from '../../views/Chat/BranchPanel';
import { useChatStore } from '../../stores/chat';

beforeEach(() => {
  useChatStore.setState({
    currentConversationId: 1,
    messages: [],
    branchThreads: [],
    currentBranchThreadId: 31,
    branchSourceMessageId: 7,
    branchMessages: [],
    isBranchOpen: true,
    isBranchLoading: false,
    isBranchReviewing: false,
    branchReviewMessage: null,
    branchError: null,
  });
});

describe('BranchPanel', () => {
  it('已批改来源显示加入复盘按钮并触发确认', () => {
    const markBranchForReview = vi.fn();
    useChatStore.setState({
      markBranchForReview,
      messages: [
        {
          id: 7,
          conversationId: 1,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'grade',
          content: '这里是批改解释',
          widgetSnapshot: {
            id: 'grading-1',
            type: 'grading-result',
            status: 'ready',
            data: {
              attemptId: 9,
              tags: ['missing_word'],
            },
            version: 1,
          },
          seq: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    render(<BranchPanel />);
    fireEvent.click(screen.getByRole('button', { name: '加入复盘' }));

    expect(markBranchForReview).toHaveBeenCalledTimes(1);
  });

  it('普通来源不显示加入复盘按钮', () => {
    useChatStore.setState({
      messages: [
        {
          id: 7,
          conversationId: 1,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'general-chat',
          content: '普通解释',
          widgetSnapshot: null,
          seq: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    render(<BranchPanel />);

    expect(screen.queryByRole('button', { name: '加入复盘' })).toBeNull();
  });

  it('支线 assistant 回复按 Markdown 渲染', () => {
    useChatStore.setState({
      branchMessages: [
        {
          id: 11,
          conversationId: 1,
          branchThreadId: 31,
          type: 'text',
          role: 'assistant',
          skillName: 'explain',
          content: '**重点**\n- How about 后面接名词或动名词',
          widgetSnapshot: null,
          seq: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    render(<BranchPanel />);

    expect(screen.getByText('重点').tagName).toBe('STRONG');
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText(/How about/)).toBeInTheDocument();
  });
});
