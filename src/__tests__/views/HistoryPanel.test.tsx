import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HistoryPanel from '../../views/Chat/HistoryPanel';
import { useChatStore } from '../../stores/chat';
import type { ConversationDTO } from '@shared/api';

function conversation(
  id: number,
  title: string | null,
  learningState: ConversationDTO['learningState'] = 'practicing'
): ConversationDTO {
  return {
    id,
    title,
    status: 'active',
    learningState,
    activeSkill: null,
    inputMode: 'chat',
    lockPolicy: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
}

beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: [],
    streamingMessageId: null,
    streamBuffer: {},
    activeWidgets: {},
    branchThreads: [],
    currentBranchThreadId: null,
    branchSourceMessageId: null,
    branchMessages: [],
    isBranchOpen: false,
    isBranchLoading: false,
    branchError: null,
    inputMode: 'chat',
    isLoading: false,
    error: null,
  });
});

describe('HistoryPanel', () => {
  it('渲染历史会话并点击切换', () => {
    const selectConversation = vi.fn();
    useChatStore.setState({
      conversations: [
        conversation(1, '餐厅点餐', 'reviewing'),
        conversation(2, null, 'scene_selecting'),
      ],
      currentConversationId: 1,
      selectConversation,
    });

    render(<HistoryPanel />);

    expect(screen.getByText('餐厅点餐')).toBeInTheDocument();
    expect(screen.getByText('会话 #2')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /会话 #2/ }));
    expect(selectConversation).toHaveBeenCalledWith(2);
  });

  it('点击当前会话不会重复加载', () => {
    const selectConversation = vi.fn();
    useChatStore.setState({
      conversations: [conversation(1, '餐厅点餐')],
      currentConversationId: 1,
      selectConversation,
    });

    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /餐厅点餐/ }));
    expect(selectConversation).not.toHaveBeenCalled();
  });

  it('点击新建入口会创建新会话', () => {
    const startNewConversation = vi.fn();
    useChatStore.setState({
      conversations: [conversation(1, '餐厅点餐')],
      currentConversationId: 1,
      startNewConversation,
    });

    render(<HistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /新建对话/ }));
    expect(startNewConversation).toHaveBeenCalled();
  });
});
