import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Onboarding from '../../views/Onboarding';
import { useChatStore } from '../../stores/chat';
import { useProfileStore } from '../../stores/profile';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
}));

vi.mock('../../api/chat.js', () => ({
  chatApi: {
    createConversation: mocks.createConversation,
  },
}));

describe('Onboarding auto kickoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    useProfileStore.setState({
      profile: null,
      loading: false,
      error: null,
    });
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      messages: [],
      streamingMessageId: null,
      currentStreamId: null,
      streamBuffer: {},
      activeWidgets: {},
      branchThreads: [],
      currentBranchThreadId: null,
      branchSourceMessageId: null,
      branchMessages: [],
      isBranchOpen: false,
      isBranchLoading: false,
      isBranchReviewing: false,
      branchReviewMessage: null,
      branchError: null,
      inputMode: 'chat',
      isLoading: false,
      error: null,
      loadConversations: vi.fn(async () => {}),
      selectConversation: vi.fn(async () => {
        useChatStore.setState({ messages: [] });
      }),
      sendMessage: vi.fn(async () => {}),
      sendAction: vi.fn(async () => {}),
    });
    mocks.createConversation.mockResolvedValue({
      id: 7,
      title: null,
      status: 'active',
      learningState: 'onboarding',
      activeSkill: null,
      inputMode: 'chat',
      lockPolicy: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    });
  });

  it('uses start-onboarding action instead of sending visible hi text', async () => {
    render(<Onboarding />);

    await waitFor(() => {
      expect(useChatStore.getState().sendAction).toHaveBeenCalledWith({
        type: 'start-onboarding',
      });
    });
    expect(useChatStore.getState().sendMessage).not.toHaveBeenCalledWith('hi');
  });
});
