/**
 * HTTP API 请求 / 响应 DTO
 *
 * 前后端共享。响应统一封装为 { data } 或 { error } 之一。
 */

import type { LearningState, InputMode, RouterDecision } from './skill.js';

/* ============================================================
 * 通用响应
 * ========================================================== */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> = { data: T } | { error: ApiError };

/* ============================================================
 * Auth
 * ========================================================== */
export interface AuthRegisterReq {
  email: string;
  password: string;
}
export interface AuthRegisterResp {
  token: string;
  user: { id: number; email: string };
}

export interface AuthLoginReq {
  email: string;
  password: string;
}
export interface AuthLoginResp {
  token: string;
  user: { id: number; email: string };
}

export interface MeResp {
  id: number;
  email: string;
}

/* ============================================================
 * Conversation
 * ========================================================== */
export interface ConversationDTO {
  id: number;
  title: string | null;
  status: 'active' | 'archived';
  learningState: LearningState;
  activeSkill: string | null;
  inputMode: InputMode;
  lockPolicy: 'open' | 'locked';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/* ============================================================
 * Message
 * ========================================================== */
export interface MessageDTO {
  id: number;
  conversationId: number;
  type: 'text' | 'widget' | 'system';
  role: 'user' | 'assistant' | 'system';
  skillName: string | null;
  content: string | null;
  widgetSnapshot: unknown | null;
  seq: number;
  createdAt: string;
}

/* ============================================================
 * Chat send / stream
 * ========================================================== */
export interface ChatSendReq {
  conversationId?: number; // 不传则自动新建
  text: string;
  mode?: InputMode;
}

export interface ChatSendResp {
  conversationId: number;
  userMessageId: number;
  assistantMessageId: number;
  streamId: string;
  decision: RouterDecision;
}
