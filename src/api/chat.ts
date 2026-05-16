/**
 * Chat API 封装(同步部分)
 *
 * SSE 流由 ./sse.ts 单独管理。
 */

import { apiClient } from './client.js';
import type {
  ConversationDTO,
  MessageDTO,
  ChatSendReq,
  ChatSendResp,
} from '@shared/api';
import type { LearningState } from '@shared/skill';

export const chatApi = {
  listConversations(): Promise<ConversationDTO[]> {
    return apiClient.get<ConversationDTO[]>('/chat/conversations');
  },
  createConversation(opts?: {
    title?: string;
    learningState?: LearningState;
  }): Promise<ConversationDTO> {
    return apiClient.post<ConversationDTO>(
      '/chat/conversations',
      opts ?? {}
    );
  },
  getMessages(conversationId: number): Promise<MessageDTO[]> {
    return apiClient.get<MessageDTO[]>(
      `/chat/conversations/${conversationId}/messages`
    );
  },
  send(body: ChatSendReq): Promise<ChatSendResp> {
    return apiClient.post<ChatSendResp>('/chat/send', body);
  },
};
