import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { SkillEvent } from '@shared/skill';

const mocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  send: vi.fn(),
  abortStream: vi.fn(),
  createConversation: vi.fn(),
  deriveConversation: vi.fn(),
  openStream: vi.fn(),
  profileGet: vi.fn(),
  getMessages: vi.fn(),
  listBranchThreads: vi.fn(),
  createBranchThread: vi.fn(),
  getBranchMessages: vi.fn(),
  sendBranchMessage: vi.fn(),
  markBranchForReview: vi.fn(),
}));

vi.mock('../../api/chat.js', () => ({
  chatApi: {
    listConversations: mocks.listConversations,
    createConversation: mocks.createConversation,
    deriveConversation: mocks.deriveConversation,
    getMessages: mocks.getMessages,
    listBranchThreads: mocks.listBranchThreads,
    createBranchThread: mocks.createBranchThread,
    getBranchMessages: mocks.getBranchMessages,
    sendBranchMessage: mocks.sendBranchMessage,
    markBranchForReview: mocks.markBranchForReview,
    send: mocks.send,
    abortStream: mocks.abortStream,
  },
}));

vi.mock('../../api/profile.js', () => ({
  profileApi: {
    get: mocks.profileGet,
    update: vi.fn(),
  },
}));

vi.mock('../../api/sse.js', () => ({
  openStream: mocks.openStream,
}));

import { useAuthStore } from '../../stores/auth.js';
import { useChatStore } from '../../stores/chat.js';
import { useLearningStateStore } from '../../stores/learningState.js';

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
    useLearningStateStore.setState({ state: 'onboarding' });
    mocks.profileGet.mockResolvedValue({
      userId: 1,
      name: 'Test',
      age: null,
      grade: null,
      level: 'A1',
      weaknessTags: [],
      recentTopics: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
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

  it('stopGenerating 会调用 abortStream 并清理流式状态', async () => {
    const close = vi.fn();
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 111,
      assistantMessageId: 112,
      streamId: 'stream-stop',
      decision: {
        skillName: 'general-chat',
        params: {},
        confidence: 0.95,
        rationale: 'test',
      },
    });
    mocks.openStream.mockReturnValue({ close });
    mocks.abortStream.mockResolvedValue({
      streamId: 'stream-stop',
      aborted: true,
    });

    await useChatStore.getState().sendMessage('slow');
    expect(useChatStore.getState().currentStreamId).toBe('stream-stop');

    await useChatStore.getState().stopGenerating();

    const state = useChatStore.getState();
    expect(mocks.abortStream).toHaveBeenCalledWith('stream-stop');
    expect(close).toHaveBeenCalled();
    expect(state.streamingMessageId).toBeNull();
    expect(state.currentStreamId).toBeNull();
    expect(state.messages.find((m) => m.id === 112)?.content).toBe(
      '已停止生成。'
    );
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

  it('state-transition 后刷新会话列表,同步历史栏标题和状态', async () => {
    useLearningStateStore.setState({ state: 'scene_selecting' });
    mocks.listConversations.mockResolvedValue([
      {
        id: 10,
        title: '餐厅点餐',
        status: 'active',
        learningState: 'practicing',
        activeSkill: 'practice',
        inputMode: 'fill',
        lockPolicy: 'locked',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
    ]);
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 801,
      assistantMessageId: 802,
      streamId: 'stream-transition',
      decision: {
        skillName: 'scene-select',
        params: {},
        confidence: 1,
        rationale: 'test',
      },
    });
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(
        event(
          'state-transition',
          { nextLearningState: 'practicing', activeSkill: 'practice' },
          1
        )
      );
      opts.onEvent(event('done', {}, 2));
      opts.onDone();
      return { close: vi.fn() };
    });

    await useChatStore.getState().sendAction({
      type: 'select-scene',
      payload: { sceneId: 'restaurant-ordering' },
    });

    expect(mocks.listConversations).toHaveBeenCalled();
    await waitFor(() => {
      expect(useChatStore.getState().conversations[0]?.title).toBe('餐厅点餐');
    });
  });

  it('后端归档旧会话并返回新会话时切换消息列表和刷新历史', async () => {
    useChatStore.setState({
      currentConversationId: 10,
      conversations: [
        {
          id: 10,
          title: '餐厅点餐',
          status: 'active',
          learningState: 'reviewing',
          activeSkill: 'review',
          inputMode: 'chat',
          lockPolicy: 'open',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archivedAt: null,
        },
      ],
      messages: [
        {
          id: 900,
          conversationId: 10,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'review',
          content: '旧会话复盘',
          widgetSnapshot: null,
          seq: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      activeWidgets: {
        old: {
          id: 'old',
          type: 'progress-summary',
          status: 'ready',
          data: {},
          version: 1,
        },
      },
      isBranchOpen: true,
      currentBranchThreadId: 31,
      branchMessages: [
        {
          id: 901,
          conversationId: 10,
          branchThreadId: 31,
          type: 'text',
          role: 'assistant',
          skillName: 'explain',
          content: '旧支线',
          widgetSnapshot: null,
          seq: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mocks.listConversations.mockResolvedValue([
      {
        id: 11,
        title: null,
        status: 'active',
        learningState: 'scene_selecting',
        activeSkill: 'scene-select',
        inputMode: 'select',
        lockPolicy: 'open',
        createdAt: '2026-01-01T00:00:01.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        archivedAt: null,
      },
      {
        id: 10,
        title: '餐厅点餐',
        status: 'archived',
        learningState: 'archived',
        activeSkill: null,
        inputMode: 'chat',
        lockPolicy: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
        archivedAt: '2026-01-01T00:00:01.000Z',
      },
    ]);
    mocks.send.mockResolvedValue({
      conversationId: 11,
      archivedConversationId: 10,
      userMessageId: 1001,
      assistantMessageId: 1002,
      streamId: 'stream-rollover',
      decision: {
        skillName: 'scene-select',
        params: { action: { type: 'request-new-scenes' } },
        confidence: 1,
        rationale: 'rollover',
      },
    });
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(event('text-chunk', { text: '新一轮开始。' }, 1));
      opts.onEvent(event('done', {}, 2));
      opts.onDone();
      return { close: vi.fn() };
    });

    await useChatStore.getState().sendMessage('换场景');

    const state = useChatStore.getState();
    expect(mocks.send).toHaveBeenCalledWith({
      conversationId: 10,
      text: '换场景',
    });
    expect(mocks.listConversations).toHaveBeenCalledTimes(1);
    expect(state.currentConversationId).toBe(11);
    expect(state.messages.map((m) => m.conversationId)).toEqual([11, 11]);
    expect(state.messages[0]).toMatchObject({
      id: 1001,
      role: 'user',
      content: '换场景',
    });
    expect(state.messages[1]).toMatchObject({
      id: 1002,
      role: 'assistant',
      content: '新一轮开始。',
      skillName: 'scene-select',
    });
    expect(state.activeWidgets).toEqual({});
    expect(state.isBranchOpen).toBe(false);
    expect(state.branchMessages).toEqual([]);
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

  it('新建会话后自动请求场景候选', async () => {
    mocks.createConversation.mockResolvedValue({
      id: 77,
      title: null,
      status: 'active',
      learningState: 'scene_selecting',
      activeSkill: null,
      inputMode: 'chat',
      lockPolicy: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    });
    mocks.send.mockResolvedValue({
      conversationId: 77,
      userMessageId: 701,
      assistantMessageId: 702,
      streamId: 'stream-new',
      decision: {
        skillName: 'scene-select',
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

    await useChatStore.getState().startNewConversation();

    const state = useChatStore.getState();
    expect(mocks.createConversation).toHaveBeenCalledWith({
      learningState: 'scene_selecting',
    });
    expect(mocks.send).toHaveBeenCalledWith({
      conversationId: 77,
      action: { type: 'request-new-scenes' },
    });
    expect(state.currentConversationId).toBe(77);
    expect(state.conversations[0]?.id).toBe(77);
    expect(state.messages[0]?.content).toBe('换一批场景');
  });

  it('从归档会话派生新会话后基于复制场景出第一题', async () => {
    mocks.deriveConversation.mockResolvedValue({
      sourceConversationId: 10,
      sceneCopied: true,
      sceneTitle: '售票窗口',
      derivedContextText:
        '继承自上一轮复盘 · 售票窗口\n结果：完全正确 4 题 / 还不错 2 题 / 错误 2 题\n薄弱点：preposition · 出现 2 次\n这轮再练会从同场景继续，重点把上一轮暴露出来的问题压下去。',
      conversation: {
        id: 88,
        title: '售票窗口 · 再练',
        status: 'active',
        learningState: 'scene_selecting',
        activeSkill: null,
        inputMode: 'chat',
        lockPolicy: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      },
    });
    mocks.send.mockResolvedValue({
      conversationId: 88,
      userMessageId: 881,
      assistantMessageId: 882,
      streamId: 'stream-derived',
      decision: {
        skillName: 'practice',
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

    await useChatStore.getState().deriveConversationFromArchived(10);

    const state = useChatStore.getState();
    expect(mocks.deriveConversation).toHaveBeenCalledWith(10);
    expect(mocks.send).toHaveBeenCalledWith({
      conversationId: 88,
      action: { type: 'next-question' },
    });
    expect(state.currentConversationId).toBe(88);
    expect(state.conversations[0]?.title).toBe('售票窗口 · 再练');
    expect(state.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('继承自上一轮复盘'),
    });
    expect(state.messages[1]?.content).toBe('下一题');
  });

  it('SSE skill error 会写入 assistant 消息,避免界面空白', async () => {
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 501,
      assistantMessageId: 502,
      streamId: 'stream-test',
      decision: {
        skillName: 'grade',
        params: {},
        confidence: 1,
        rationale: 'test',
      },
    });
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onEvent(
        event(
          'error',
          {
            code: 'GRADE_FAILED',
            message: 'deepseek-reasoner does not support this tool_choice',
          },
          1
        )
      );
      opts.onError?.(
        new Error(
          'GRADE_FAILED: deepseek-reasoner does not support this tool_choice'
        ),
        { kind: 'skill' }
      );
      return { close: vi.fn() };
    });

    await useChatStore.getState().sendAction({
      type: 'submit-answer',
      payload: { attemptId: 9, answer: "It's 25 pounds" },
    });

    const state = useChatStore.getState();
    const assistant = state.messages.find((m) => m.id === 502);
    expect(assistant?.content).toContain('出错了:GRADE_FAILED');
    expect(assistant?.content).toContain('does not support this tool_choice');
    expect(state.streamingMessageId).toBeNull();
  });

  it('SSE 传输失败后会回退到消息历史快照恢复内容和 widget', async () => {
    mocks.send.mockResolvedValue({
      conversationId: 10,
      userMessageId: 601,
      assistantMessageId: 602,
      streamId: 'stream-snapshot',
      decision: {
        skillName: 'review',
        params: {},
        confidence: 1,
        rationale: 'test',
      },
    });
    mocks.getMessages.mockResolvedValue([
      {
        id: 601,
        conversationId: 10,
        branchThreadId: null,
        type: 'text',
        role: 'user',
        skillName: null,
        content: '复盘',
        widgetSnapshot: null,
        seq: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 602,
        conversationId: 10,
        branchThreadId: null,
        type: 'text',
        role: 'assistant',
        skillName: 'review',
        content: '回放后的总结内容',
        widgetSnapshot: {
          id: 'summary-1',
          type: 'progress-summary',
          status: 'ready',
          data: {
            questionsCount: 8,
            averageScore: 82.5,
            categoryCounts: {
              exact: 4,
              similar: 2,
              incorrect: 2,
            },
          },
          version: 1,
        },
        seq: 2,
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ]);
    mocks.openStream.mockImplementation((_streamId, opts) => {
      opts.onError(new Error('SSE 连接失败,已放弃重连'));
      return { close: vi.fn() };
    });

    await useChatStore.getState().sendMessage('复盘');

    const state = useChatStore.getState();
    const assistant = state.messages.find((m) => m.id === 602);
    expect(mocks.getMessages).toHaveBeenCalledWith(10);
    expect(assistant?.content).toBe('回放后的总结内容');
    expect(assistant?.widgetSnapshot).toMatchObject({
      id: 'summary-1',
      type: 'progress-summary',
      status: 'ready',
      data: {
        questionsCount: 8,
        averageScore: 82.5,
      },
    });
    expect(state.streamingMessageId).toBeNull();
    expect(state.currentStreamId).toBeNull();
    expect(state.error).toBeNull();
  });

  it('打开辅助追问会创建支线并隔离支线消息', async () => {
    useChatStore.setState({
      currentConversationId: 10,
      messages: [
        {
          id: 7,
          conversationId: 10,
          branchThreadId: null,
          type: 'text',
          role: 'assistant',
          skillName: 'grade',
          content: '这里是批改解释',
          widgetSnapshot: null,
          seq: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mocks.listBranchThreads.mockResolvedValue([]);
    mocks.createBranchThread.mockResolvedValue({
      id: 31,
      userId: 1,
      conversationId: 10,
      sourceMessageId: 7,
      sourceRef: { kind: 'message', messageId: 7 },
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mocks.getBranchMessages.mockResolvedValue([]);
    mocks.sendBranchMessage.mockResolvedValue({
      userMessage: {
        id: 41,
        conversationId: 10,
        branchThreadId: 31,
        type: 'text',
        role: 'user',
        skillName: null,
        content: '为什么这样说?',
        widgetSnapshot: null,
        seq: 4,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      assistantMessage: {
        id: 42,
        conversationId: 10,
        branchThreadId: 31,
        type: 'text',
        role: 'assistant',
        skillName: 'explain',
        content: '因为这里更礼貌。',
        widgetSnapshot: null,
        seq: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await useChatStore.getState().openBranchForMessage(7);
    let state = useChatStore.getState();
    expect(state.isBranchOpen).toBe(true);
    expect(state.currentBranchThreadId).toBe(31);
    expect(state.branchSourceMessageId).toBe(7);
    expect(mocks.createBranchThread).toHaveBeenCalledWith(10, {
      sourceMessageId: 7,
      sourceRef: { kind: 'message', messageId: 7 },
    });

    await useChatStore.getState().sendBranchMessage('为什么这样说?');
    state = useChatStore.getState();
    expect(state.branchMessages.map((m) => m.branchThreadId)).toEqual([31, 31]);
    expect(state.messages).toHaveLength(1);
  });

  it('加入复盘会调用支线确认接口并显示结果', async () => {
    useChatStore.setState({
      currentBranchThreadId: 31,
      isBranchReviewing: false,
      branchReviewMessage: null,
      branchError: null,
    });
    mocks.markBranchForReview.mockResolvedValue({
      threadId: 31,
      sourceMessageId: 7,
      attemptId: 9,
      gradingId: 10,
      tags: ['missing_word'],
      createdEventsCount: 1,
      existingEventsCount: 0,
      masteriesUpdatedCount: 1,
      message: '已加入复盘:新增 1 条错因记录,同步更新 1 个掌握度。',
    });

    await useChatStore.getState().markBranchForReview();

    const state = useChatStore.getState();
    expect(mocks.markBranchForReview).toHaveBeenCalledWith(31);
    expect(state.isBranchReviewing).toBe(false);
    expect(state.branchReviewMessage).toContain('已加入复盘');
  });
});
