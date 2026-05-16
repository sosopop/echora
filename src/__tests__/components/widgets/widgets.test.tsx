/**
 * SceneCards / ExerciseCard / GradingResult widget 简单 render 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SceneCards from '../../../components/widgets/SceneCards';
import ExerciseCard from '../../../components/widgets/ExerciseCard';
import GradingResult from '../../../components/widgets/GradingResult';
import { useChatStore } from '../../../stores/chat';
import type { LearningWidgetInstance } from '@shared/skill';

beforeEach(() => {
  // 重置 chat store
  useChatStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: [],
    streamingMessageId: null,
    streamBuffer: {},
    activeWidgets: {},
    inputMode: 'select',
    isLoading: false,
    error: null,
  });
});

describe('SceneCards widget', () => {
  it('渲染 N 张卡片 + click 触发 sendAction(select-scene)', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction });
    const widget: LearningWidgetInstance = {
      id: 'w1',
      type: 'scene-cards',
      status: 'ready',
      data: {
        cards: [
          { id: 'cafe', title: '咖啡店', description: '点单', difficulty: 'B1', emoji: '☕' },
          { id: 'taxi', title: '打车', description: '问路', difficulty: 'B1' },
        ],
      },
      version: 1,
    };
    render(<SceneCards widget={widget} />);
    expect(screen.getByText('咖啡店')).toBeInTheDocument();
    expect(screen.getByText('打车')).toBeInTheDocument();
    fireEvent.click(screen.getByText('咖啡店'));
    expect(sendAction).toHaveBeenCalledWith({
      type: 'select-scene',
      payload: { sceneId: 'cafe' },
    });
  });

  it('换一批按钮 → sendAction(request-new-scenes)', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction });
    const widget: LearningWidgetInstance = {
      id: 'w2',
      type: 'scene-cards',
      status: 'ready',
      data: { cards: [{ id: 'a', title: 'A', description: 'x' }] },
      version: 1,
    };
    render(<SceneCards widget={widget} />);
    fireEvent.click(screen.getByText('换一批'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'request-new-scenes' });
  });

  it('streaming 时按钮禁用', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction, streamingMessageId: 1 });
    const widget: LearningWidgetInstance = {
      id: 'w3',
      type: 'scene-cards',
      status: 'ready',
      data: { cards: [{ id: 'a', title: 'A', description: 'x' }] },
      version: 1,
    };
    render(<SceneCards widget={widget} />);
    fireEvent.click(screen.getByText('A'));
    expect(sendAction).not.toHaveBeenCalled();
  });
});

describe('ExerciseCard widget', () => {
  it('fill 模式渲染阶段/题号/中文上下文/英文空白', () => {
    const widget: LearningWidgetInstance = {
      id: 'e1',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 42,
        stage: 1,
        questionNo: 2,
        questionType: 'fill_word',
        contextZh: '我想点一份牛排。',
        contextEn: 'I would ______ a steak.',
        hint: '首字母:l',
        inputMode: 'fill',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getByText(/阶段 1/)).toBeInTheDocument();
    expect(screen.getByText(/第 2 题/)).toBeInTheDocument();
    expect(screen.getByText(/单词填空/)).toBeInTheDocument();
    expect(screen.getByText('我想点一份牛排。')).toBeInTheDocument();
    expect(screen.getByText(/I would/)).toBeInTheDocument();
  });

  it('整句翻译显示中文 + 提示,无英文行', () => {
    const widget: LearningWidgetInstance = {
      id: 'e2',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 43,
        stage: 2,
        questionNo: 1,
        questionType: 'sentence_translation',
        contextZh: '请把这句话翻译成英文。',
        hint: '完整句子',
        inputMode: 'chat',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getByText(/整句翻译/)).toBeInTheDocument();
    expect(screen.getByText('请把这句话翻译成英文。')).toBeInTheDocument();
  });
});

describe('GradingResult widget', () => {
  it('correct 状态渲染分数 + badge + 参考答案 + 下一题按钮', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction });
    const widget: LearningWidgetInstance = {
      id: 'g1',
      type: 'grading-result',
      status: 'ready',
      data: {
        attemptId: 42,
        score: 92,
        isCorrect: true,
        userAnswer: 'I would like a steak.',
        referenceAnswer: "I'd like to order a steak.",
        explanation: '答得很好,可以再自然些。',
        tags: [],
      },
      version: 1,
    };
    render(<GradingResult widget={widget} />);
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('通过')).toBeInTheDocument();
    expect(screen.getByText('I would like a steak.')).toBeInTheDocument();
    expect(screen.getByText("I'd like to order a steak.")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/下一题/));
    expect(sendAction).toHaveBeenCalledWith({ type: 'next-question' });
  });

  it('wrong 状态渲染错误标签 chips', () => {
    useChatStore.setState({ sendAction: vi.fn() });
    const widget: LearningWidgetInstance = {
      id: 'g2',
      type: 'grading-result',
      status: 'ready',
      data: {
        attemptId: 43,
        score: 40,
        isCorrect: false,
        userAnswer: 'wrong answer',
        explanation: '动词错',
        tags: ['tense', 'preposition'],
      },
      version: 1,
    };
    render(<GradingResult widget={widget} />);
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('未通过')).toBeInTheDocument();
    expect(screen.getByText('tense')).toBeInTheDocument();
    expect(screen.getByText('preposition')).toBeInTheDocument();
  });
});
