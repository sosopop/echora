/**
 * SceneCards / ExerciseCard / GradingResult widget 简单 render 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SceneCards from '../../../components/widgets/SceneCards';
import ExerciseCard from '../../../components/widgets/ExerciseCard';
import GradingResult from '../../../components/widgets/GradingResult';
import ProgressSummary from '../../../components/widgets/ProgressSummary';
import AnswerReview from '../../../components/widgets/AnswerReview';
import IntentConfirm from '../../../components/widgets/IntentConfirm';
import LearningMenu from '../../../components/widgets/LearningMenu';
import AccountGate from '../../../components/widgets/AccountGate';
import FollowUpSource from '../../../components/widgets/FollowUpSource';
import ConversationLock from '../../../components/widgets/ConversationLock';
import WidgetRenderer from '../../../components/widgets/WidgetRenderer';
import { useChatStore } from '../../../stores/chat';
import { useLearningStateStore } from '../../../stores/learningState';
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
    composerFocusRequestId: 0,
    isLoading: false,
    error: null,
  });
  useLearningStateStore.setState({ state: 'scene_selecting' });
});

describe('SceneCards widget', () => {
  it('loading 状态不显示空场景小部件', () => {
    const widget: LearningWidgetInstance = {
      id: 'w-loading',
      type: 'scene-cards',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<SceneCards widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/还没有可用场景/)).not.toBeInTheDocument();
  });

  it('渲染 8 张推荐卡 + 自定义卡,click 推荐触发 sendAction(select-scene)', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction });
    const cards = Array.from({ length: 8 }, (_, index) => ({
      id: `scene-${index + 1}`,
      title: `场景 ${index + 1}`,
      description: `描述 ${index + 1}`,
      knowledgePoint: `知识点 ${index + 1}`,
      difficulty: 'B1',
      emoji: ['☕', '🚕', '🏫', '🍝', '✈️', '🛍️', '🏥', '🎬'][index],
    }));
    const widget: LearningWidgetInstance = {
      id: 'w1',
      type: 'scene-cards',
      status: 'ready',
      data: {
        cards,
      },
      version: 1,
    };
    render(<SceneCards widget={widget} />);
    expect(screen.getAllByRole('button')).toHaveLength(10);
    expect(screen.getByText('场景 1')).toBeInTheDocument();
    expect(screen.getByText('场景 8')).toBeInTheDocument();
    expect(screen.getByText('自定义场景')).toBeInTheDocument();
    fireEvent.click(screen.getByText('场景 1'));
    expect(sendAction).toHaveBeenCalledWith({
      type: 'select-scene',
      payload: {
        sceneId: 'scene-1',
        title: '场景 1',
        description: '描述 1',
        difficulty: 'B1',
        knowledgePoint: '知识点 1',
      },
    });
  });

  it('点击自定义卡只切回 chat 输入并请求聚焦', () => {
    const sendAction = vi.fn();
    useChatStore.setState({
      sendAction,
      inputMode: 'select',
      composerFocusRequestId: 0,
    });
    const widget: LearningWidgetInstance = {
      id: 'w-custom',
      type: 'scene-cards',
      status: 'ready',
      data: {
        cards: [
          { id: 'a', title: 'A', description: 'x', knowledgePoint: '问句', difficulty: 'B1', emoji: '☕' },
        ],
        allowCustom: true,
      },
      version: 1,
    };
    render(<SceneCards widget={widget} />);

    fireEvent.click(screen.getByText('自定义场景'));

    expect(sendAction).not.toHaveBeenCalled();
    expect(useChatStore.getState().inputMode).toBe('chat');
    expect(useChatStore.getState().composerFocusRequestId).toBe(1);
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

  it('空候选展示可恢复提示 + 重新生成按钮', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction });
    const widget: LearningWidgetInstance = {
      id: 'w4',
      type: 'scene-cards',
      status: 'error',
      data: {
        cards: [],
        message: '场景生成失败,请重新生成或直接输入想练的主题。',
      },
      version: 1,
    };
    render(<SceneCards widget={widget} />);
    expect(screen.getByText(/场景生成失败/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('重新生成场景'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'request-new-scenes' });
  });
});

describe('ExerciseCard widget', () => {
  it('loading 状态不显示阶段问号题卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'e-loading',
      type: 'exercise-card',
      status: 'loading',
      data: {},
      version: 1,
    };

    const { container } = render(<ExerciseCard widget={widget} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/阶段 \?/)).not.toBeInTheDocument();
  });

  it('fill 模式渲染阶段/题号/中文上下文/英文空白', () => {
    const widget: LearningWidgetInstance = {
      id: 'e1',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 42,
        stage: 1,
        totalStages: 4,
        questionNo: 2,
        stageGoal: 2,
        questionType: 'fill_word',
        contextZh: '我想点一份牛排。',
        contextEn: 'I would ______ a steak.',
        hint: '首字母:l',
        inputMode: 'fill',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getByText('阶段 1/4')).toBeInTheDocument();
    expect(screen.getByText('第 2/2 题')).toBeInTheDocument();
    expect(screen.getByLabelText('进度 2/2')).toBeInTheDocument();
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

  it('对话接龙显示上一句英文和题型标签', () => {
    const widget: LearningWidgetInstance = {
      id: 'e3',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 44,
        stage: 3,
        questionNo: 1,
        questionType: 'dialogue_chain',
        contextZh: '请接住这句对话,用英文回复。',
        contextEn: 'Server: Welcome.',
        targetZh: '一杯咖啡谢谢。',
        hint: '你正在回应 Server,当前角色:Customer',
        inputMode: 'chat',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getByText(/对话接龙/)).toBeInTheDocument();
    expect(screen.getByText('Server: Welcome.')).toBeInTheDocument();
    expect(screen.getByText('请表达')).toBeInTheDocument();
    expect(screen.getByText('「一杯咖啡谢谢。」')).toBeInTheDocument();
  });

  it('角色互换显示角色提示和题型标签', () => {
    const widget: LearningWidgetInstance = {
      id: 'e4',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 45,
        stage: 4,
        questionNo: 1,
        questionType: 'role_reversal',
        contextZh: '角色互换:你现在扮演 Server,请把下面这句话用英文说出来。',
        targetZh: '欢迎光临。',
        hint: '当前角色:Server;先主动开口,不用等对方提问。',
        inputMode: 'chat',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getAllByText(/角色互换/).length).toBeGreaterThan(0);
    expect(screen.getByText('请表达')).toBeInTheDocument();
    expect(screen.getByText('「欢迎光临。」')).toBeInTheDocument();
    expect(screen.getByText(/当前角色:Server/)).toBeInTheDocument();
    expect(screen.queryByText('Your role: Server')).not.toBeInTheDocument();
  });

  it('重练题显示重练标签而不是阶段 5', () => {
    const widget: LearningWidgetInstance = {
      id: 'e5',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 46,
        stage: 5,
        questionNo: 1,
        stageGoal: 3,
        questionType: 'fill_word',
        contextZh: '降难重练:补上小词。',
        contextEn: 'I want ______ order soup.',
        hint: '两个字母',
        inputMode: 'fill',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getByText('重练')).toBeInTheDocument();
    expect(screen.getByText('第 1/3 题')).toBeInTheDocument();
    expect(screen.queryByText(/阶段 5/)).not.toBeInTheDocument();
  });

  it('替换题显示替换题标签而不是重练或阶段 5', () => {
    const widget: LearningWidgetInstance = {
      id: 'e6',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 47,
        stage: 5,
        questionNo: 1,
        stageGoal: 1,
        questionType: 'fill_word',
        remediationKind: 'replacement',
        contextZh: '降难替换题:补上小词。',
        contextEn: 'I want ______ order soup.',
        hint: '两个字母',
        inputMode: 'fill',
      },
      version: 1,
    };
    render(<ExerciseCard widget={widget} />);
    expect(screen.getByText('替换题')).toBeInTheDocument();
    expect(screen.getByText('第 1/1 题')).toBeInTheDocument();
    expect(screen.queryByText('重练')).not.toBeInTheDocument();
    expect(screen.queryByText(/阶段 5/)).not.toBeInTheDocument();
  });
});

describe('GradingResult widget', () => {
  it('loading 状态不提前渲染 0 分结果', () => {
    const widget: LearningWidgetInstance = {
      id: 'g-loading',
      type: 'grading-result',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<GradingResult widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('exact 状态渲染完全正确,不显示分数和下一题按钮', () => {
    const widget: LearningWidgetInstance = {
      id: 'g1',
      type: 'grading-result',
      status: 'ready',
      data: {
        attemptId: 42,
        score: 92,
        isCorrect: true,
        category: 'exact',
        userAnswer: 'I would like a steak.',
        referenceAnswer: "I'd like to order a steak.",
        explanation: '答得很好,可以再自然些。',
        tags: [],
      },
      version: 1,
    };
    render(<GradingResult widget={widget} />);
    expect(screen.queryByText('92')).not.toBeInTheDocument();
    expect(screen.getByText('完全正确')).toBeInTheDocument();
    expect(screen.getByText(/已自动继续练习/)).toBeInTheDocument();
    expect(screen.getByText('I would like a steak.')).toBeInTheDocument();
    expect(screen.getByText("I'd like to order a steak.")).toBeInTheDocument();
    expect(screen.queryByText(/下一题/)).not.toBeInTheDocument();
  });

  it('similar 状态渲染还不错,不显示分数', () => {
    const widget: LearningWidgetInstance = {
      id: 'g-similar',
      type: 'grading-result',
      status: 'ready',
      data: {
        attemptId: 44,
        score: 86,
        isCorrect: true,
        category: 'similar',
        userAnswer: 'I want one steak.',
        referenceAnswer: "I'd like to order a steak.",
        explanation: '意思接近,但礼貌度和自然度还可以再调整。',
        tags: [],
      },
      version: 1,
    };
    render(<GradingResult widget={widget} />);
    expect(screen.queryByText('86')).not.toBeInTheDocument();
    expect(screen.getByText('还不错')).toBeInTheDocument();
    expect(screen.getByText(/意思相近/)).toBeInTheDocument();
  });

  it('wrong 状态渲染中文错误标签 chips', () => {
    const widget: LearningWidgetInstance = {
      id: 'g2',
      type: 'grading-result',
      status: 'ready',
      data: {
        attemptId: 43,
        score: 40,
        isCorrect: false,
        category: 'incorrect',
        userAnswer: 'wrong answer',
        explanation: '动词错',
        tags: ['tense', 'preposition'],
      },
      version: 1,
    };
    render(<GradingResult widget={widget} />);
    expect(screen.queryByText('40')).not.toBeInTheDocument();
    expect(screen.getByText('错误')).toBeInTheDocument();
    expect(screen.getByText('时态')).toBeInTheDocument();
    expect(screen.getByText('介词')).toBeInTheDocument();
    expect(screen.queryByText('tense')).not.toBeInTheDocument();
    expect(screen.queryByText('preposition')).not.toBeInTheDocument();
    expect(screen.getAllByText(/改一句再提交/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/跳过到下一题/)).not.toBeInTheDocument();
  });

  it('有支线回调时只在批改卡片内显示追问按钮', () => {
    const onOpenBranch = vi.fn();
    const widget: LearningWidgetInstance = {
      id: 'g-branch',
      type: 'grading-result',
      status: 'ready',
      data: {
        attemptId: 43,
        score: 40,
        isCorrect: false,
        category: 'incorrect',
        userAnswer: 'wrong answer',
        explanation: '动词错',
        tags: ['missing_word'],
      },
      version: 1,
    };
    render(<GradingResult widget={widget} onOpenBranch={onOpenBranch} />);

    fireEvent.click(screen.getByRole('button', { name: '追问' }));

    expect(onOpenBranch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('缺少成分')).toBeInTheDocument();
  });
});

describe('ProgressSummary widget', () => {
  it('loading 状态不显示空复盘卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'p-loading',
      type: 'progress-summary',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<ProgressSummary widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/学习报告/)).not.toBeInTheDocument();
  });

  it('渲染三档分布、掌握度、强弱项和建议', () => {
    const sendMessage = vi.fn();
    useChatStore.setState({ sendMessage });
    const widget: LearningWidgetInstance = {
      id: 'p1',
      type: 'progress-summary',
      status: 'ready',
      data: {
        title: '餐厅点餐 · 已经达标',
        sceneName: '餐厅点餐',
        questionsCount: 8,
        averageScore: 86,
        averageScoreDelta: 0,
        categoryCounts: { exact: 3, similar: 4, incorrect: 1 },
        weakTagsCount: 1,
        masteredScenesCount: 2,
        masteries: [
          { tag: 'fill_word', score: 88, delta: 0 },
          { tag: 'missing_word', score: 38, delta: 0 },
        ],
        strongPoints: ['整句翻译 · 第 2-1 题 90 分'],
        weakPoints: ['missing_word · 出现 1 次'],
        nextSuggestions: [
          {
            title: '重练 missing_word',
            desc: '后续可基于这个薄弱点生成专项题。',
            action: 'retry:missing_word',
          },
        ],
      },
      version: 1,
    };
    render(<ProgressSummary widget={widget} />);
    expect(screen.getByText('餐厅点餐 · 已经达标')).toBeInTheDocument();
    expect(screen.queryByText('86')).not.toBeInTheDocument();
    expect(screen.getByText('完全正确')).toBeInTheDocument();
    expect(screen.getByText('还不错')).toBeInTheDocument();
    expect(screen.getByText('错误')).toBeInTheDocument();
    expect(screen.getByText('fill_word')).toBeInTheDocument();
    expect(screen.getByText('缺少成分 · 出现 1 次')).toBeInTheDocument();
    expect(screen.getByText('重练 缺少成分')).toBeInTheDocument();
    fireEvent.click(screen.getByText('开始'));
    expect(sendMessage).toHaveBeenCalledWith('重练 missing_word');
  });

  it('WidgetRenderer 对 progress-summary 使用正式组件', () => {
    const widget: LearningWidgetInstance = {
      id: 'p2',
      type: 'progress-summary',
      status: 'ready',
      data: {
        title: '当前会话 · 继续巩固',
        sceneName: '当前会话',
        questionsCount: 2,
        averageScore: 75,
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    expect(screen.getByText('当前会话 · 继续巩固')).toBeInTheDocument();
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});

describe('AnswerReview widget', () => {
  it('loading 状态不显示空回看卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'ar-loading',
      type: 'answer-review',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<AnswerReview widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/单题回看/)).not.toBeInTheDocument();
  });

  it('渲染题目列表、分数、题型和错误标签', () => {
    const widget: LearningWidgetInstance = {
      id: 'ar1',
      type: 'answer-review',
      status: 'ready',
      data: {
        title: '餐厅点餐 · 2 道题回看',
        items: [
          {
            questionNo: 1,
            promptShort: 'Fill the blank: I would ______ coffee.',
            questionType: 'fill_word',
            score: 92,
            status: 'ok',
            tags: [],
          },
          {
            questionNo: 2,
            promptShort: 'Translate to English: 我想要水。',
            questionType: 'sentence_translation',
            score: 55,
            status: 'bad',
            tags: ['missing_word'],
          },
        ],
      },
      version: 1,
    };
    render(<AnswerReview widget={widget} />);
    expect(screen.getByText('餐厅点餐 · 2 道题回看')).toBeInTheDocument();
    expect(screen.getByText('Q1')).toBeInTheDocument();
    expect(screen.getByText('✓ 92')).toBeInTheDocument();
    expect(screen.getByText('整句翻译')).toBeInTheDocument();
    expect(screen.getByText('缺少成分')).toBeInTheDocument();
    expect(screen.getByText(/2 题平均 74 分/)).toBeInTheDocument();
  });

  it('WidgetRenderer 对 answer-review 使用正式组件', () => {
    const widget: LearningWidgetInstance = {
      id: 'ar2',
      type: 'answer-review',
      status: 'ready',
      data: {
        title: '1 道题回看',
        items: [
          {
            questionNo: 1,
            promptShort: 'Hello.',
            questionType: 'dialogue_chain',
            score: 80,
            status: 'ok',
            tags: [],
          },
        ],
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    expect(screen.getByText('1 道题回看')).toBeInTheDocument();
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});

describe('ConversationLock widget', () => {
  it('loading 或缺字段时不渲染空锁定卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'lock-loading',
      type: 'conversation-lock',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<ConversationLock widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/历史答案/)).not.toBeInTheDocument();
  });

  it('渲染练习中锁定提示', () => {
    const widget: LearningWidgetInstance = {
      id: 'lock-1',
      type: 'conversation-lock',
      status: 'ready',
      data: {
        variant: 'practicing',
        title: '练习中 · 历史答案暂时隐藏',
        description: '完成当前题后可查看完整答案和批改详情。',
      },
      version: 1,
    };
    render(<ConversationLock widget={widget} />);
    expect(screen.getByText('练习中 · 历史答案暂时隐藏')).toBeInTheDocument();
    expect(screen.getByText(/完整答案和批改详情/)).toBeInTheDocument();
  });

  it('WidgetRenderer 对 conversation-lock 使用正式组件', () => {
    const widget: LearningWidgetInstance = {
      id: 'lock-2',
      type: 'conversation-lock',
      status: 'ready',
      data: {
        variant: 'grading',
        title: '批改中 · 历史详情暂时隐藏',
        description: '批改完成后会恢复完整历史。',
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    expect(screen.getByText('批改中 · 历史详情暂时隐藏')).toBeInTheDocument();
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});

describe('FollowUpSource widget', () => {
  it('loading 或缺字段时不渲染空来源卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'follow-loading',
      type: 'follow-up-source',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<FollowUpSource widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/来自/)).not.toBeInTheDocument();
  });

  it('渲染批改来源与提示', () => {
    const widget: LearningWidgetInstance = {
      id: 'follow-1',
      type: 'follow-up-source',
      status: 'ready',
      data: {
        sourceKind: 'grading',
        sourceLabel: '来自:最近一次批改 · 55 分',
        snippet: '阶段 2 · 第 1 题 · 整句翻译',
        canMarkForReview: true,
      },
      version: 1,
    };
    render(<FollowUpSource widget={widget} />);
    expect(screen.getByText('来自:最近一次批改 · 55 分')).toBeInTheDocument();
    expect(screen.getByText('阶段 2 · 第 1 题 · 整句翻译')).toBeInTheDocument();
    expect(screen.getByText('不改变主学习流')).toBeInTheDocument();
  });

  it('WidgetRenderer 对 follow-up-source 使用正式组件', () => {
    const widget: LearningWidgetInstance = {
      id: 'follow-2',
      type: 'follow-up-source',
      status: 'ready',
      data: {
        sourceKind: 'exercise',
        sourceLabel: '来自:当前题目',
        snippet: '阶段 1 · 第 1 题 · 单词填空',
        canMarkForReview: false,
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    expect(screen.getByText('来自:当前题目')).toBeInTheDocument();
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});

describe('IntentConfirm widget', () => {
  it('loading 或选项不足时不渲染空确认卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'intent-loading',
      type: 'intent-confirm',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<IntentConfirm widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/你想/)).not.toBeInTheDocument();
  });

  it('点击 action 选项触发结构化动作', () => {
    const sendAction = vi.fn();
    useChatStore.setState({ sendAction });
    const widget: LearningWidgetInstance = {
      id: 'intent-1',
      type: 'intent-confirm',
      status: 'ready',
      data: {
        question: '你想让我怎么处理?',
        choices: [
          {
            id: 'new-scenes',
            title: '换一批场景',
            desc: '重新生成场景卡片',
            action: 'action:request-new-scenes',
          },
          {
            id: 'review',
            title: '看复盘',
            desc: '查看本轮总结',
            action: 'text:复盘',
          },
        ],
        risk: 'medium',
      },
      version: 1,
    };
    render(<IntentConfirm widget={widget} />);
    fireEvent.click(screen.getByText('换一批场景'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'request-new-scenes' });
  });

  it('点击 text 选项触发文本消息,WidgetRenderer 不走 fallback', () => {
    const sendMessage = vi.fn();
    useChatStore.setState({ sendMessage });
    const widget: LearningWidgetInstance = {
      id: 'intent-2',
      type: 'intent-confirm',
      status: 'ready',
      data: {
        question: '你想让我怎么处理?',
        choices: [
          {
            id: 'review',
            title: '看复盘',
            action: 'text:复盘',
          },
          {
            id: 'retry',
            title: '重练',
            action: 'text:重练',
          },
        ],
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    fireEvent.click(screen.getByText('看复盘'));
    expect(sendMessage).toHaveBeenCalledWith('复盘');
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});

describe('LearningMenu widget', () => {
  it('loading 或空 sections 时不渲染空菜单', () => {
    const widget: LearningWidgetInstance = {
      id: 'menu-loading',
      type: 'learning-menu',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<LearningMenu widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('学习菜单')).not.toBeInTheDocument();
  });

  it('渲染菜单并执行 action/text/retry 协议,WidgetRenderer 不走 fallback', () => {
    const sendAction = vi.fn();
    const sendMessage = vi.fn();
    useChatStore.setState({ sendAction, sendMessage });
    const widget: LearningWidgetInstance = {
      id: 'menu-1',
      type: 'learning-menu',
      status: 'ready',
      data: {
        sections: [
          {
            title: '主线',
            items: [
              {
                id: 'next',
                icon: '>',
                label: '继续练习',
                action: 'action:next-question',
                primary: true,
              },
              {
                id: 'review',
                icon: '?',
                label: '查看复盘',
                action: 'text:复盘',
              },
              {
                id: 'retry',
                icon: '+',
                label: '重练介词',
                action: 'retry:preposition',
              },
            ],
          },
        ],
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    fireEvent.click(screen.getByText('继续练习'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'next-question' });
    fireEvent.click(screen.getByText('查看复盘'));
    expect(sendMessage).toHaveBeenCalledWith('复盘');
    fireEvent.click(screen.getByText('重练介词'));
    expect(sendMessage).toHaveBeenCalledWith('重练 preposition');
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});

describe('AccountGate widget', () => {
  it('loading 或缺字段时不渲染空账号卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'account-loading',
      type: 'account-gate',
      status: 'loading',
      data: {},
      version: 1,
    };
    const { container } = render(<AccountGate widget={widget} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/保存进度/)).not.toBeInTheDocument();
  });

  it('渲染保存进度提示并执行按钮动作,WidgetRenderer 不走 fallback', () => {
    const sendAction = vi.fn();
    const sendMessage = vi.fn();
    useChatStore.setState({ sendAction, sendMessage });
    const widget: LearningWidgetInstance = {
      id: 'account-1',
      type: 'account-gate',
      status: 'ready',
      data: {
        intent: 'save_progress',
        title: '进度已保存',
        description: '当前会话、题目和批改结果会继续保留。',
        primaryAction: {
          label: '继续练习',
          action: 'action:next-question',
        },
        secondaryAction: {
          label: '查看复盘',
          action: 'text:复盘',
        },
      },
      version: 1,
    };
    render(<WidgetRenderer widget={widget} />);
    expect(screen.getByText('进度已保存')).toBeInTheDocument();
    fireEvent.click(screen.getByText('继续练习'));
    expect(sendAction).toHaveBeenCalledWith({ type: 'next-question' });
    fireEvent.click(screen.getByText('查看复盘'));
    expect(sendMessage).toHaveBeenCalledWith('复盘');
    expect(screen.queryByText(/未实现 widget/)).not.toBeInTheDocument();
  });
});
