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
import { openStream } from '../api/sse.js';
import { useAuthStore } from './auth.js';
import { useLearningStateStore } from './learningState.js';
import { useProfileStore } from './profile.js';
import { describeChatAction } from '@shared/api';
import type {
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
  streamBuffer: Record<number, string>;
  activeWidgets: Record<string, LearningWidgetInstance>;
  inputMode: InputMode;
  isLoading: boolean;
  error: string | null;

  loadConversations(): Promise<void>;
  selectConversation(id: number): Promise<void>;
  sendMessage(text: string): Promise<void>;
  sendAction(action: ChatAction): Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  streamingMessageId: null,
  streamBuffer: {},
  activeWidgets: {},
  inputMode: 'chat',
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
    set({ isLoading: true, error: null, currentConversationId: id });
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

  async sendMessage(text: string) {
    if (!text.trim()) return;
    return await sendInternal({ text }, get, set);
  },

  async sendAction(action: ChatAction) {
    return await sendInternal({ action }, get, set);
  },
}));

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
  const optimisticConversationId = conversationId ?? 0;
  const optimisticUserId = nextOptimisticId();
  const optimisticAssistantId = nextOptimisticId();
  const optimisticUserMsg: MessageDTO = {
    id: optimisticUserId,
    conversationId: optimisticConversationId,
    type: 'text',
    role: 'user',
    skillName: null,
    content: optimisticContent,
    widgetSnapshot: null,
    seq: 0,
    createdAt: new Date().toISOString(),
  };
  const optimisticAssistantMsg: MessageDTO = {
    id: optimisticAssistantId,
    conversationId: optimisticConversationId,
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
    isLoading: true,
    error: null,
  }));
  try {
    const resp = await chatApi.send({ conversationId, ...body });
    set((s) => ({
      currentConversationId: resp.conversationId,
      messages: s.messages.map((m) => {
        if (m.id === optimisticUserId) {
          return {
            ...m,
            id: resp.userMessageId,
            conversationId: resp.conversationId,
          };
        }
        if (m.id === optimisticAssistantId) {
          return {
            ...m,
            id: resp.assistantMessageId,
            conversationId: resp.conversationId,
            skillName: resp.decision.skillName,
          };
        }
        return m;
      }),
      streamingMessageId: resp.assistantMessageId,
      isLoading: false,
    }));

    openStream(resp.streamId, {
      token,
      onEvent: (evt: SkillEvent) => {
        handleStreamEvent(set, get, resp.assistantMessageId, evt);
      },
      onDone: () => {
        clearStreamBuffer(set, resp.assistantMessageId, null);
      },
      onError: (err) => {
        clearStreamBuffer(set, resp.assistantMessageId, err.message);
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '发送失败';
    set({
      isLoading: false,
      streamingMessageId: null,
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
  error: string | null
): void {
  set((s) => {
    const { [messageId]: _removed, ...rest } = s.streamBuffer;
    return {
      streamingMessageId: null,
      streamBuffer: rest,
      error,
    };
  });
}
