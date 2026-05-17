import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatInput from '../../views/Chat/ChatInput';
import { useChatStore } from '../../stores/chat';
import { useLearningStateStore } from '../../stores/learningState';
import type { MessageDTO } from '@shared/api';

function messageWithSceneWidget(
  status: 'loading' | 'ready' | 'error',
  cards: unknown[]
): MessageDTO {
  return {
    id: 1,
    conversationId: 1,
    branchThreadId: null,
    type: 'text',
    role: 'assistant',
    skillName: 'scene-select',
    content: '',
    widgetSnapshot: {
      id: 'scene-cards-1',
      type: 'scene-cards',
      status,
      data: { cards },
      version: 1,
    },
    seq: 1,
    createdAt: new Date().toISOString(),
  };
}

function messageWithExerciseWidget(attemptId: number): MessageDTO {
  return {
    id: 2,
    conversationId: 1,
    branchThreadId: null,
    type: 'text',
    role: 'assistant',
    skillName: 'practice',
    content: '阶段 2 · 第 1 题',
    widgetSnapshot: {
      id: `exercise-${attemptId}`,
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId,
        stage: 2,
        questionNo: 1,
        questionType: 'sentence_translation',
        inputMode: 'chat',
      },
      version: 1,
    },
    seq: 2,
    createdAt: new Date().toISOString(),
  };
}

function messageWithGradingWidget(
  attemptId: number,
  isCorrect: boolean
): MessageDTO {
  return {
    id: 3,
    conversationId: 1,
    branchThreadId: null,
    type: 'text',
    role: 'assistant',
    skillName: 'grade',
    content: '批改完成',
    widgetSnapshot: {
      id: `grading-${attemptId}`,
      type: 'grading-result',
      status: 'ready',
      data: { attemptId, isCorrect, score: isCorrect ? 90 : 40 },
      version: 1,
    },
    seq: 3,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    currentConversationId: 1,
    messages: [],
    streamingMessageId: null,
    streamBuffer: {},
    activeWidgets: {},
    inputMode: 'chat',
    isLoading: false,
    error: null,
  });
  useLearningStateStore.setState({ state: 'scene_selecting' });
});

describe('ChatInput scene-select recovery', () => {
  it('select 模式有可选卡片时只提示点击卡片', () => {
    useChatStore.setState({
      inputMode: 'select',
      messages: [
        messageWithSceneWidget('ready', [
          { id: 'cafe', title: '咖啡店', description: '点单' },
        ]),
      ],
    });

    render(<ChatInput />);

    expect(screen.getByText(/请在上方点击场景卡片选择/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/场景没加载出来/)).not.toBeInTheDocument();
  });

  it('select 模式无候选时恢复文本输入并允许重新生成', () => {
    const sendAction = vi.fn();
    useChatStore.setState({
      inputMode: 'select',
      sendAction,
      messages: [messageWithSceneWidget('loading', [])],
    });

    render(<ChatInput />);

    expect(screen.getByPlaceholderText(/场景没加载出来/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('重新生成场景'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'request-new-scenes' });
  });

  it('practicing 状态遗留 select 模式时显示开始练习入口', () => {
    const sendAction = vi.fn();
    useLearningStateStore.setState({ state: 'practicing' });
    useChatStore.setState({
      inputMode: 'select',
      sendAction,
      messages: [
        messageWithSceneWidget('ready', [
          { id: 'cafe', title: '咖啡店', description: '点单' },
        ]),
      ],
    });

    render(<ChatInput />);

    expect(screen.getByText(/场景已选定/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('开始练习'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'next-question' });
  });

  it('practicing 中 chat 模式输入也作为最新题答案提交', () => {
    const sendAction = vi.fn();
    const sendMessage = vi.fn();
    useLearningStateStore.setState({ state: 'practicing' });
    useChatStore.setState({
      inputMode: 'chat',
      sendAction,
      sendMessage,
      messages: [messageWithExerciseWidget(88)],
    });

    render(<ChatInput />);

    fireEvent.change(screen.getByPlaceholderText(/直接打字告诉我/), {
      target: { value: 'No, thank you.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(sendAction).toHaveBeenCalledWith({
      type: 'submit-answer',
      payload: { attemptId: 88, answer: 'No, thank you.' },
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('最新题已通过后输入 go 不会重复提交同一题', () => {
    const sendAction = vi.fn();
    const sendMessage = vi.fn();
    useLearningStateStore.setState({ state: 'practicing' });
    useChatStore.setState({
      inputMode: 'chat',
      sendAction,
      sendMessage,
      messages: [
        messageWithExerciseWidget(89),
        messageWithGradingWidget(89, true),
      ],
    });

    render(<ChatInput />);

    fireEvent.change(screen.getByPlaceholderText(/直接打字告诉我/), {
      target: { value: 'go' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(sendAction).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('go');
  });

  it('practicing 中控制指令不会被当作答案提交', () => {
    const sendAction = vi.fn();
    const sendMessage = vi.fn();
    useLearningStateStore.setState({ state: 'practicing' });
    useChatStore.setState({
      inputMode: 'chat',
      sendAction,
      sendMessage,
      messages: [messageWithExerciseWidget(90)],
    });

    render(<ChatInput />);

    fireEvent.change(screen.getByPlaceholderText(/直接打字告诉我/), {
      target: { value: '出题' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    expect(sendAction).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('出题');
  });

  it('发送后在流式回复结束时恢复输入框焦点', async () => {
    const sendMessage = vi.fn(async () => {
      useChatStore.setState({ streamingMessageId: 123 });
    });
    useChatStore.setState({
      inputMode: 'chat',
      sendMessage,
    });

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText(
      /直接打字告诉我/
    ) as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('hello'));
    await waitFor(() => expect(textarea).toBeDisabled());

    act(() => {
      useChatStore.setState({ streamingMessageId: null });
    });

    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea).toHaveValue('');
  });
});
