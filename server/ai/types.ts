/**
 * AI Provider 抽象
 *
 * 所有 LLM 服务商实现 AIProvider 接口,通过工厂(./providers/index.ts)注入。
 * 002 起 chat() 替代旧的 complete():支持多轮 messages、system prompt、tools。
 */

import type { RouterInput, RouterDecision } from '../../shared/skill.js';

export interface DebugContext {
  traceId?: string;
  userId?: number;
  conversationId?: number;
  messageId?: number;
  streamId?: string;
  runId?: string;
  skillName?: string;
  learningState?: string;
  phase?: string;
}

/* ============================================================
 * Chat 多轮对话契约
 * ========================================================== */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema:Anthropic SDK 直接消费 input_schema 字段 */
  inputSchema: Record<string, unknown>;
}

export interface ChatRequest {
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: 'auto' | { type: 'tool'; name: string };
  maxTokens?: number;
  signal: AbortSignal;
  debug?: DebugContext;
}

export interface RouteRequest {
  input: RouterInput;
  signal: AbortSignal;
  debug?: DebugContext;
}

export type ChatStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-use'; toolName: string; input: Record<string, unknown> }
  | { type: 'message-stop'; stopReason: string };

/* ============================================================
 * Provider 接口
 * ========================================================== */
export interface AIProvider {
  readonly name: string;

  /**
   * 路由决策:根据用户输入与上下文,选择 Skill 并给出参数。
   */
  route(
    input: RouterInput,
    signal?: AbortSignal,
    debug?: DebugContext
  ): Promise<RouterDecision>;

  /**
   * 多轮 chat 流式调用(可选)。
   * Skill handler 通过此接口与 LLM 交互,Stub Provider 不实现。
   */
  chat?(req: ChatRequest): AsyncIterable<ChatStreamEvent>;
}
