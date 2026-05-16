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
import type {
  ConversationDTO,
  MessageDTO,
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
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ error: '未登录,无法发送' });
      return;
    }

    const conversationId = get().currentConversationId ?? undefined;
    set({ isLoading: true, error: null });
    try {
      const resp = await chatApi.send({ conversationId, text });
      // 立即把用户消息塞进列表(乐观)
      const optimisticUserMsg: MessageDTO = {
        id: resp.userMessageId,
        conversationId: resp.conversationId,
        type: 'text',
        role: 'user',
        skillName: null,
        content: text,
        widgetSnapshot: null,
        seq: 0,
        createdAt: new Date().toISOString(),
      };
      const optimisticAssistantMsg: MessageDTO = {
        id: resp.assistantMessageId,
        conversationId: resp.conversationId,
        type: 'text',
        role: 'assistant',
        skillName: resp.decision.skillName,
        content: '',
        widgetSnapshot: null,
        seq: 0,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        currentConversationId: resp.conversationId,
        messages: [...s.messages, optimisticUserMsg, optimisticAssistantMsg],
        streamingMessageId: resp.assistantMessageId,
        isLoading: false,
      }));

      openStream(resp.streamId, {
        token,
        onEvent: (evt: SkillEvent) => {
          handleStreamEvent(set, get, resp.assistantMessageId, evt);
        },
        onDone: () => {
          set({ streamingMessageId: null });
        },
        onError: (err) => {
          set({
            streamingMessageId: null,
            error: err.message,
          });
        },
      });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : '发送失败',
      });
    }
  },
}));

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
    set((s) => ({
      streamBuffer: { ...s.streamBuffer, [messageId]: prev + evt.payload.text },
    }));
  } else if (evt.type === 'widget-init' || evt.type === 'widget-ready') {
    const widget =
      evt.type === 'widget-init'
        ? evt.payload.widget
        : ({
            ...(get().activeWidgets[evt.payload.widgetId] ?? {}),
            ...evt.payload.patch,
            id: evt.payload.widgetId,
          } as LearningWidgetInstance);
    set((s) => ({
      activeWidgets: { ...s.activeWidgets, [widget.id]: widget },
    }));
  } else if (evt.type === 'widget-update') {
    const prev = get().activeWidgets[evt.payload.widgetId];
    if (!prev) return;
    const merged: LearningWidgetInstance = {
      ...prev,
      ...evt.payload.patch,
    };
    set((s) => ({
      activeWidgets: { ...s.activeWidgets, [merged.id]: merged },
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
