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
  profile: ProfileDTO | null;
  onboardingCompleted: boolean;
}

/* ============================================================
 * Profile
 * ========================================================== */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface ProfileDTO {
  userId: number;
  name: string | null;
  age: number | null;
  grade: string | null;
  level: CefrLevel | null;
  weaknessTags: string[];
  recentTopics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileUpdateReq {
  name?: string;
  age?: number;
  grade?: string;
  level?: CefrLevel;
  weaknessTags?: string[];
  recentTopics?: string[];
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
  branchThreadId: number | null;
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

/**
 * Widget 结构化交互动作(PRD §2.3「结构化菜单动作优先走确定性路由」)。
 * 与 ChatSendReq.text 二选一(由 zod refine 保证)。
 */
export type ChatAction =
  | { type: 'select-scene'; payload: { sceneId: string } }
  | { type: 'request-new-scenes' }
  | { type: 'submit-answer'; payload: { attemptId: number; answer: string } }
  | { type: 'skip-question'; payload: { attemptId: number } }
  | { type: 'next-question' };

export function describeChatAction(action: ChatAction | undefined): string {
  if (!action) return '执行操作';
  switch (action.type) {
    case 'select-scene':
      return `选择场景:${action.payload.sceneId}`;
    case 'request-new-scenes':
      return '换一批场景';
    case 'submit-answer':
      return action.payload.answer || '提交答案';
    case 'skip-question':
      return '跳过本题';
    case 'next-question':
      return '下一题';
    default:
      return '执行操作';
  }
}

export interface ChatSendReq {
  conversationId?: number; // 不传则自动新建
  /** 自由文本输入(与 action 二选一) */
  text?: string;
  /** 结构化 widget 交互(与 text 二选一) */
  action?: ChatAction;
  mode?: InputMode;
}

export interface ChatSendResp {
  conversationId: number;
  userMessageId: number;
  assistantMessageId: number;
  streamId: string;
  decision: RouterDecision;
}

/* ============================================================
 * Branch follow-up threads(PRD §3.2)
 * ========================================================== */
export interface BranchThreadDTO {
  id: number;
  userId: number;
  conversationId: number;
  sourceMessageId: number;
  sourceRef: unknown | null;
  status: 'open' | 'closed';
  createdAt: string;
}

export interface BranchThreadCreateReq {
  sourceMessageId: number;
  sourceRef?: unknown;
}

export interface BranchMessageSendReq {
  text: string;
}

export interface BranchMessageSendResp {
  userMessage: MessageDTO;
  assistantMessage: MessageDTO;
}

/* ============================================================
 * Scene dialogue(PRD §2.5)
 * ========================================================== */
export interface SceneDialogueTurn {
  role: string;
  en: string;
  zh: string;
}

export interface SceneDialogueDTO {
  id: number;
  conversationId: number;
  sceneId: string;
  title: string;
  difficulty: CefrLevel;
  roles: string[];
  turns: SceneDialogueTurn[];
  createdAt: string;
}
