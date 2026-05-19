/**
 * Chat store(Zustand)
 *
 * 维护:
 *   - conversations 列表与当前选中
 *   - 当前会话消息列表
 *   - 流式状态:streamingMessageId / streamBuffer
 *   - activeWidgets:按 widgetId 索引的最新 LearningWidget 状态
 *   - learningState / inputMode 镜像
 *
 * sendMessage 流程:
 *   POST /chat/send → 拿 streamId → openStream → 在 onEvent 累积 buffer
 */

import { create } from 'zustand';
import { chatApi } from '../api/chat.js';
import { openStream, type OpenStreamHandle } from '../api/sse.js';
import { useAuthStore } from './auth.js';
import { useLearningStateStore } from './learningState.js';
import { useProfileStore } from './profile.js';
import { describeChatAction } from '@shared/api';
import type {
  BranchThreadDTO,
  ConversationDTO,
  MessageDTO,
  ChatAction,
  ChatSendReq,
} from '@shared/api';
import type {
  SkillEvent,
  LearningWidgetInstance,
  InputMode,
} from '@shared/skill';

interface ChatState {
  conversations: ConversationDTO[];
  currentConversationId: number | null;
  messages: MessageDTO[];
  streamingMessageId: number | null;
  currentStreamId: string | null;
  streamBuffer: Record<number, string>;
  activeWidgets: Record<string, LearningWidgetInstance>;
  branchThreads: BranchThreadDTO[];
  currentBranchThreadId: number | null;
  branchSourceMessageId: number | null;
  branchMessages: MessageDTO[];
  isBranchOpen: boolean;
  isBranchLoading: boolean;
  isBranchReviewing: boolean;
  branchReviewMessage: string | null;
  branchError: string | null;
  inputMode: InputMode;
  composerFocusRequestId: number;
  isLoading: boolean;
  error: string | null;

  loadConversations(): Promise<void>;
  selectConversation(id: number): Promise<void>;
  startNewConversation(): Promise<void>;
  deriveConversationFromArchived(id: number): Promise<void>;
  sendMessage(text: string): Promise<void>;
  sendAction(action: ChatAction): Promise<void>;
  setInputMode(mode: InputMode, options?: { focus?: boolean }): void;
  activateChatInput(): void;
  stopGenerating(): Promise<void>;
  openBranchForMessage(messageId: number): Promise<void>;
  openBranchForWidget(messageId: number, sourceRef: unknown): Promise<void>;
  closeBranch(): void;
  sendBranchMessage(text: string): Promise<void>;
  markBranchForReview(): Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
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
  composerFocusRequestId: 0,
  isLoading: false,
  error: null,

  async loadConversations() {
    set({ isLoading: true, error: null });
    try {
      const list = await chatApi.listConversations();
      set({ conversations: list, isLoading: false });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : '加载会话失败',
      });
    }
  },

  async selectConversation(id: number) {
    set({
      isLoading: true,
      error: null,
      currentConversationId: id,
      branchThreads: [],
      currentBranchThreadId: null,
      branchSourceMessageId: null,
      branchMessages: [],
      isBranchOpen: false,
      isBranchLoading: false,
      isBranchReviewing: false,
      branchReviewMessage: null,
      branchError: null,
    });
    try {
      const messages = await chatApi.getMessages(id);
      set({ messages, isLoading: false });
      const conv = get().conversations.find((c) => c.id === id);
      if (conv) {
        useLearningStateStore.getState().setState(conv.learningState);
        set({ inputMode: conv.inputMode });
      }
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : '加载消息失败',
      });
    }
  },

  async startNewConversation() {
    set({ isLoading: true, error: null });
    try {
      const conv = await chatApi.createConversation({
        learningState: 'scene_selecting',
      });
      set((s) => ({
        conversations: [conv, ...s.conversations.filter((c) => c.id !== conv.id)],
        currentConversationId: conv.id,
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
        inputMode: conv.inputMode,
        isLoading: false,
      }));
      useLearningStateStore.getState().setState(conv.learningState);
      await sendInternal({ action: { type: 'request-new-scenes' } }, get, set);
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : '新建会话失败',
      });
    }
  },

  async deriveConversationFromArchived(id: number) {
    set({ isLoading: true, error: null });
    try {
      const result = await chatApi.deriveConversation(id);
      const conv = result.conversation;
      const derivedContextMessage = result.derivedContextText
        ? {
            id: -Math.floor(Date.now() / 1000),
            conversationId: conv.id,
            branchThreadId: null,
            type: 'system' as const,
            role: 'system' as const,
            skillName: null,
            content: result.derivedContextText,
            widgetSnapshot: null,
            seq: 0,
            createdAt: new Date().toISOString(),
          }
        : null;
      set((s) => ({
        conversations: [
          conv,
          ...s.conversations.filter((c) => c.id !== conv.id),
        ],
        currentConversationId: conv.id,
        messages: derivedContextMessage ? [derivedContextMessage] : [],
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
        inputMode: conv.inputMode,
        isLoading: false,
      }));
      useLearningStateStore.getState().setState(conv.learningState);
      await sendInternal(
        {
          action: result.sceneCopied
            ? { type: 'next-question' }
            : { type: 'request-new-scenes' },
        },
        get,
        set
      );
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : '基于历史会话再练失败',
      });
    }
  },

  async sendMessage(text: string) {
    if (!text.trim()) return;
    return await sendInternal({ text }, get, set);
  },

  async sendAction(action: ChatAction) {
    return await sendInternal({ action }, get, set);
  },

  setInputMode(mode, options) {
    set((s) => ({
      inputMode: mode,
      composerFocusRequestId: options?.focus
        ? s.composerFocusRequestId + 1
        : s.composerFocusRequestId,
    }));
  },

  activateChatInput() {
    set((s) => ({
      inputMode: 'chat',
      composerFocusRequestId: s.composerFocusRequestId + 1,
    }));
  },

  async stopGenerating() {
    const streamId = get().currentStreamId;
    const messageId = get().streamingMessageId;
    if (!streamId || messageId == null) return;
    try {
      await chatApi.abortStream(streamId);
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '停止生成失败',
      });
      return;
    } finally {
      activeStreamHandle?.close();
      activeStreamHandle = null;
    }
    clearStreamBuffer(set, messageId, null, true);
  },

  async openBranchForMessage(messageId: number) {
    await openBranchInternal(messageId, { kind: 'message', messageId }, get, set);
  },

  async openBranchForWidget(messageId: number, sourceRef: unknown) {
    await openBranchInternal(messageId, sourceRef, get, set);
  },

  closeBranch() {
    set({
      isBranchOpen: false,
      currentBranchThreadId: null,
      branchSourceMessageId: null,
      branchMessages: [],
      isBranchReviewing: false,
      branchReviewMessage: null,
      branchError: null,
    });
  },

  async sendBranchMessage(text: string) {
    const trimmed = text.trim();
    const threadId = get().currentBranchThreadId;
    if (!trimmed || !threadId) return;
    set({ isBranchLoading: true, branchError: null });
    try {
      const resp = await chatApi.sendBranchMessage(threadId, trimmed);
      set((s) => ({
        branchMessages: [
          ...s.branchMessages,
          resp.userMessage,
          resp.assistantMessage,
        ],
        isBranchLoading: false,
      }));
    } catch (e) {
      set({
        isBranchLoading: false,
        branchError: e instanceof Error ? e.message : '发送支线追问失败',
      });
    }
  },

  async markBranchForReview() {
    const threadId = get().currentBranchThreadId;
    if (!threadId) {
      set({ branchError: '请先打开一条辅助追问' });
      return;
    }
    set({ isBranchReviewing: true, branchError: null });
    try {
      const resp = await chatApi.markBranchForReview(threadId);
      set({
        isBranchReviewing: false,
        branchReviewMessage: resp.message,
      });
    } catch (e) {
      set({
        isBranchReviewing: false,
        branchError: e instanceof Error ? e.message : '加入复盘失败',
      });
    }
  },
}));

async function openBranchInternal(
  messageId: number,
  sourceRef: unknown,
  get: () => ChatState,
  set: (
    partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)
  ) => void
): Promise<void> {
    const conversationId = get().currentConversationId;
    if (!conversationId) {
      set({ branchError: '请先选择会话' });
      return;
    }
    set({
      isBranchOpen: true,
      isBranchLoading: true,
      isBranchReviewing: false,
      branchReviewMessage: null,
      branchError: null,
      branchSourceMessageId: messageId,
    });
    try {
      const list = await chatApi.listBranchThreads(conversationId);
      let thread =
        list.find(
          (t) =>
            t.sourceMessageId === messageId &&
            sourceRefsEqual(t.sourceRef, sourceRef)
        ) ?? null;
      if (!thread) {
        thread = await chatApi.createBranchThread(conversationId, {
          sourceMessageId: messageId,
          sourceRef,
        });
      }
      const nextThreads = list.some((t) => t.id === thread.id)
        ? list
        : [...list, thread];
      const messages = await chatApi.getBranchMessages(thread.id);
      set({
        branchThreads: nextThreads,
        currentBranchThreadId: thread.id,
        branchSourceMessageId: messageId,
        branchMessages: messages,
        isBranchLoading: false,
        isBranchReviewing: false,
        branchReviewMessage: null,
        branchError: null,
      });
    } catch (e) {
      set({
        isBranchLoading: false,
        branchError: e instanceof Error ? e.message : '打开辅助追问失败',
      });
    }
}

function sourceRefsEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

let activeStreamHandle: OpenStreamHandle | null = null;

/* ============================================================
 * 共享发送逻辑(text 或 action)
 * ========================================================== */
async function sendInternal(
  body: Pick<ChatSendReq, 'text' | 'action'>,
  get: () => ChatState,
  set: (
    partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)
  ) => void
): Promise<void> {
  const token = useAuthStore.getState().token;
  if (!token) {
    set({ error: '未登录,无法发送' });
    return;
  }
  const conversationId = get().currentConversationId ?? undefined;
  const optimisticContent = getUserMessageContent(body);
  const optimisticRole = getUserMessageRole(body);
  const optimisticType = optimisticRole === 'system' ? 'system' : 'text';
  const optimisticConversationId = conversationId ?? 0;
  const optimisticUserId = nextOptimisticId();
  const optimisticAssistantId = nextOptimisticId();
  const optimisticUserMsg: MessageDTO = {
    id: optimisticUserId,
    conversationId: optimisticConversationId,
    branchThreadId: null,
    type: optimisticType,
    role: optimisticRole,
    skillName: null,
    content: optimisticContent,
    widgetSnapshot: null,
    seq: 0,
    createdAt: new Date().toISOString(),
  };
  const optimisticAssistantMsg: MessageDTO = {
    id: optimisticAssistantId,
    conversationId: optimisticConversationId,
    branchThreadId: null,
    type: 'text',
    role: 'assistant',
    skillName: null,
    content: '',
    widgetSnapshot: null,
    seq: 0,
    createdAt: new Date().toISOString(),
  };
  set((s) => ({
    messages: [...s.messages, optimisticUserMsg, optimisticAssistantMsg],
    streamingMessageId: optimisticAssistantId,
    currentStreamId: null,
    isLoading: true,
    error: null,
  }));
  try {
    const resp = await chatApi.send({ conversationId, ...body });
    const switchedConversation = resp.conversationId !== conversationId;
    const nextUserMsg: MessageDTO = {
      ...optimisticUserMsg,
      id: resp.userMessageId,
      conversationId: resp.conversationId,
    };
    const nextAssistantMsg: MessageDTO = {
      ...optimisticAssistantMsg,
      id: resp.assistantMessageId,
      conversationId: resp.conversationId,
      skillName: resp.decision.skillName,
    };
    set((s) => ({
      currentConversationId: resp.conversationId,
      messages: switchedConversation
        ? [nextUserMsg, nextAssistantMsg]
        : s.messages.map((m) => {
            if (m.id === optimisticUserId) return nextUserMsg;
            if (m.id === optimisticAssistantId) return nextAssistantMsg;
            return m;
          }),
      streamingMessageId: resp.assistantMessageId,
      currentStreamId: resp.streamId,
      streamBuffer: switchedConversation ? {} : s.streamBuffer,
      activeWidgets: switchedConversation ? {} : s.activeWidgets,
      branchThreads: switchedConversation ? [] : s.branchThreads,
      currentBranchThreadId: switchedConversation
        ? null
        : s.currentBranchThreadId,
      branchSourceMessageId: switchedConversation
        ? null
        : s.branchSourceMessageId,
      branchMessages: switchedConversation ? [] : s.branchMessages,
      isBranchOpen: switchedConversation ? false : s.isBranchOpen,
      isBranchLoading: switchedConversation ? false : s.isBranchLoading,
      isBranchReviewing: switchedConversation ? false : s.isBranchReviewing,
      branchReviewMessage: switchedConversation ? null : s.branchReviewMessage,
      branchError: switchedConversation ? null : s.branchError,
      isLoading: false,
    }));
    if (resp.archivedConversationId != null || switchedConversation) {
      void useChatStore.getState().loadConversations();
    }

    activeStreamHandle?.close();
    activeStreamHandle = openStream(resp.streamId, {
      token,
      onEvent: (evt: SkillEvent) => {
        handleStreamEvent(set, get, resp.assistantMessageId, evt);
      },
      onDone: () => {
        activeStreamHandle = null;
        clearStreamBuffer(set, resp.assistantMessageId, null);
      },
      onError: (err, info) => {
        activeStreamHandle = null;
        if (info?.kind === 'skill') {
          clearStreamBuffer(set, resp.assistantMessageId, err.message);
          return;
        }
        void recoverStreamSnapshot(set, get, {
          conversationId: resp.conversationId,
          messageId: resp.assistantMessageId,
          streamId: resp.streamId,
          fallbackError: err.message,
        });
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '发送失败';
    set({
      isLoading: false,
      streamingMessageId: null,
      currentStreamId: null,
      error: message,
      messages: get().messages.map((m) =>
        m.id === optimisticAssistantId
          ? { ...m, content: `发送失败:${message}` }
          : m
      ),
    });
  }
}

let optimisticId = -1;

function nextOptimisticId(): number {
  return optimisticId--;
}

function getUserMessageContent(
  body: Pick<ChatSendReq, 'text' | 'action'>
): string {
  if (body.text) return body.text;
  if (body.action?.type === 'submit-answer') {
    return body.action.payload.answer;
  }
  return describeChatAction(body.action);
}

function getUserMessageRole(
  body: Pick<ChatSendReq, 'text' | 'action'>
): 'user' | 'system' {
  return body.action?.type === 'start-onboarding' ? 'system' : 'user';
}

function handleStreamEvent(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>)
  ) => void,
  get: () => ChatState,
  messageId: number,
  evt: SkillEvent
): void {
  if (evt.type === 'text-chunk') {
    const prev = get().streamBuffer[messageId] ?? '';
    const next = prev + evt.payload.text;
    set((s) => ({
      streamBuffer: { ...s.streamBuffer, [messageId]: next },
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, content: next } : m
      ),
    }));
  } else if (evt.type === 'widget-init' || evt.type === 'widget-ready') {
    const widget =
      evt.type === 'widget-init'
        ? evt.payload.widget
        : ({
            ...(get().activeWidgets[evt.payload.widgetId] ??
              findMessageWidget(get().messages, messageId, evt.payload.widgetId) ??
              {}),
            ...evt.payload.patch,
            id: evt.payload.widgetId,
          } as LearningWidgetInstance);
    set((s) => ({
      activeWidgets: { ...s.activeWidgets, [widget.id]: widget },
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, widgetSnapshot: mergeWidgetSnapshot(m.widgetSnapshot, widget) }
          : m
      ),
    }));
  } else if (evt.type === 'widget-update') {
    const prev =
      get().activeWidgets[evt.payload.widgetId] ??
      findMessageWidget(get().messages, messageId, evt.payload.widgetId);
    if (!prev) return;
    const merged: LearningWidgetInstance = {
      ...prev,
      ...evt.payload.patch,
    };
    set((s) => ({
      activeWidgets: { ...s.activeWidgets, [merged.id]: merged },
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, widgetSnapshot: mergeWidgetSnapshot(m.widgetSnapshot, merged) }
          : m
      ),
    }));
  } else if (evt.type === 'mode-switch') {
    set({ inputMode: evt.payload.mode });
  } else if (evt.type === 'state-transition') {
    useLearningStateStore.getState().setState(evt.payload.nextLearningState);
    // 学习态变化(如 onboarding → scene_selecting)往往伴随 profile 更新,
    // 异步刷新画像,RouteGuard / 视图凭新 profile 决定下一步导航
    void useProfileStore.getState().reload();
    // 场景选定等状态变化可能同步更新 conversations.title / input_mode,
    // 刷新左侧历史栏,让标题和学习态不等到下一次进页面才更新。
    void useChatStore.getState().loadConversations();
  } else if (evt.type === 'error') {
    const text = formatStreamError(evt);
    set((s) => ({
      streamBuffer: { ...s.streamBuffer, [messageId]: text },
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, content: text } : m
      ),
    }));
  }
}

function findMessageWidget(
  messages: MessageDTO[],
  messageId: number,
  widgetId: string
): LearningWidgetInstance | null {
  const msg = messages.find((m) => m.id === messageId);
  const snap = widgetSnapshotToArray(msg?.widgetSnapshot).find(
    (w) => w.id === widgetId
  );
  if (!snap?.id || snap.id !== widgetId || !snap.type) return null;
  return {
    id: snap.id,
    type: snap.type,
    status: snap.status ?? 'ready',
    data: snap.data ?? {},
    version: snap.version ?? 1,
  };
}

function widgetSnapshotToArray(
  snapshot: unknown
): Partial<LearningWidgetInstance>[] {
  if (Array.isArray(snapshot)) {
    return snapshot.filter(
      (w): w is Partial<LearningWidgetInstance> =>
        typeof w === 'object' && w !== null
    );
  }
  if (typeof snapshot === 'object' && snapshot !== null) {
    return [snapshot as Partial<LearningWidgetInstance>];
  }
  return [];
}

function mergeWidgetSnapshot(
  snapshot: unknown,
  widget: LearningWidgetInstance
): LearningWidgetInstance | LearningWidgetInstance[] {
  const widgets = widgetSnapshotToArray(snapshot).filter(
    (w): w is LearningWidgetInstance =>
      typeof w.id === 'string' &&
      typeof w.type === 'string' &&
      w.id !== widget.id
  );
  widgets.push(widget);
  return widgets.length === 1 ? widgets[0] : widgets;
}

function clearStreamBuffer(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>)
  ) => void,
  messageId: number,
  error: string | null,
  aborted = false
): void {
  set((s) => {
    const { [messageId]: _removed, ...rest } = s.streamBuffer;
    const fallbackError = error ? `出错了:${error}` : null;
    const stoppedText = '已停止生成。';
    return {
      streamingMessageId: null,
      currentStreamId: null,
      streamBuffer: rest,
      error,
      messages: fallbackError
        ? s.messages.map((m) =>
            m.id === messageId && !m.content
              ? { ...m, content: fallbackError }
              : m
          )
        : aborted
        ? s.messages.map((m) =>
            m.id === messageId && !m.content
              ? { ...m, content: stoppedText }
              : m
          )
        : s.messages,
    };
  });
}

async function recoverStreamSnapshot(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>)
  ) => void,
  get: () => ChatState,
  opts: {
    conversationId: number;
    messageId: number;
    streamId: string;
    fallbackError: string;
  }
): Promise<void> {
  try {
    const messages = await chatApi.getMessages(opts.conversationId);
    const current = get();
    if (
      current.currentConversationId !== opts.conversationId ||
      current.currentStreamId !== opts.streamId ||
      current.streamingMessageId !== opts.messageId
    ) {
      return;
    }
    const mergedMessages = mergeRecoveredMessages(current.messages, messages);
    const recoveredWidgets = buildWidgetsFromMessages(messages);
    set({
      messages: mergedMessages,
      activeWidgets: { ...recoveredWidgets, ...current.activeWidgets },
      streamBuffer: {},
      streamingMessageId: null,
      currentStreamId: null,
      error: null,
      isLoading: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : opts.fallbackError;
    if (
      get().currentConversationId !== opts.conversationId ||
      get().currentStreamId !== opts.streamId ||
      get().streamingMessageId !== opts.messageId
    ) {
      return;
    }
    clearStreamBuffer(set, opts.messageId, message);
  }
}

function buildWidgetsFromMessages(
  messages: MessageDTO[]
): Record<string, LearningWidgetInstance> {
  const widgets: Record<string, LearningWidgetInstance> = {};
  for (const msg of messages) {
    for (const snap of widgetSnapshotToArray(msg.widgetSnapshot)) {
      if (!snap.id || !snap.type) continue;
      widgets[snap.id] = {
        id: snap.id,
        type: snap.type,
        status: snap.status ?? 'ready',
        data: (snap.data ?? {}) as Record<string, unknown>,
        version: snap.version ?? 1,
      };
    }
  }
  return widgets;
}

function mergeRecoveredMessages(
  currentMessages: MessageDTO[],
  recoveredMessages: MessageDTO[]
): MessageDTO[] {
  const currentById = new Map(currentMessages.map((msg) => [msg.id, msg]));
  return recoveredMessages.map((msg) => {
    const live = currentById.get(msg.id);
    if (!live) return msg;
    const recoveredContent = msg.content?.trim() ?? '';
    const liveContent = live.content?.trim() ?? '';
    return {
      ...msg,
      content: recoveredContent || liveContent,
      widgetSnapshot: live.widgetSnapshot ?? msg.widgetSnapshot,
    };
  });
}

function formatStreamError(
  evt: Extract<SkillEvent, { type: 'error' }>
): string {
  const detailText =
    import.meta.env.DEV && evt.payload.details
      ? `\n${JSON.stringify(evt.payload.details, null, 2)}`
      : '';
  return `出错了:${evt.payload.code}: ${evt.payload.message}${detailText}`;
}
