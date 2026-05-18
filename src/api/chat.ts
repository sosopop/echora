/**
 * Chat API 封装(同步部分)
 *
 * SSE 流由 ./sse.ts 单独管理。
 */

import { apiClient } from './client.js';
import type {
  ConversationDTO,
  MessageDTO,
  BranchMessageSendResp,
  BranchReviewMarkResp,
  BranchThreadCreateReq,
  BranchThreadDTO,
  ChatSendReq,
  ChatSendResp,
  ChatAbortStreamResp,
  ConversationDeriveResp,
  SceneDialogueDTO,
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
  deriveConversation(conversationId: number): Promise<ConversationDeriveResp> {
    return apiClient.post<ConversationDeriveResp>(
      `/chat/conversations/${conversationId}/derive`,
      {}
    );
  },
  getMessages(conversationId: number): Promise<MessageDTO[]> {
    return apiClient.get<MessageDTO[]>(
      `/chat/conversations/${conversationId}/messages`
    );
  },
  listBranchThreads(conversationId: number): Promise<BranchThreadDTO[]> {
    return apiClient.get<BranchThreadDTO[]>(
      `/chat/conversations/${conversationId}/branch-threads`
    );
  },
  createBranchThread(
    conversationId: number,
    body: BranchThreadCreateReq
  ): Promise<BranchThreadDTO> {
    return apiClient.post<BranchThreadDTO>(
      `/chat/conversations/${conversationId}/branch-threads`,
      body
    );
  },
  getBranchMessages(threadId: number): Promise<MessageDTO[]> {
    return apiClient.get<MessageDTO[]>(
      `/chat/branch-threads/${threadId}/messages`
    );
  },
  sendBranchMessage(
    threadId: number,
    text: string
  ): Promise<BranchMessageSendResp> {
    return apiClient.post<BranchMessageSendResp>(
      `/chat/branch-threads/${threadId}/messages`,
      { text }
    );
  },
  markBranchForReview(threadId: number): Promise<BranchReviewMarkResp> {
    return apiClient.post<BranchReviewMarkResp>(
      `/chat/branch-threads/${threadId}/review`,
      {}
    );
  },
  send(body: ChatSendReq): Promise<ChatSendResp> {
    return apiClient.post<ChatSendResp>('/chat/send', body);
  },
  abortStream(streamId: string): Promise<ChatAbortStreamResp> {
    return apiClient.post<ChatAbortStreamResp>(
      `/chat/streams/${encodeURIComponent(streamId)}/abort`,
      {}
    );
  },
  getSceneDialogue(conversationId: number): Promise<SceneDialogueDTO> {
    return apiClient.get<SceneDialogueDTO>(
      `/chat/conversations/${conversationId}/scene-dialogue`
    );
  },
};
