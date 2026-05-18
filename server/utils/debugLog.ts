import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import type { Config } from '../config/getConfig.js';
import type { DebugContext } from '../ai/types.js';

export interface DebugLogEntry {
  timestamp: string;
  level: 'debug' | 'error';
  type: string;
  traceId?: string;
  userId?: number;
  conversationId?: number;
  messageId?: number;
  streamId?: string;
  runId?: string;
  skillName?: string;
  learningState?: string;
  phase?: string;
  [key: string]: unknown;
}

export interface DebugLogInput {
  level: 'debug' | 'error';
  type: string;
  traceId?: string;
  userId?: number;
  conversationId?: number;
  messageId?: number;
  streamId?: string;
  runId?: string;
  skillName?: string;
  learningState?: string;
  phase?: string;
  [key: string]: unknown;
}

export type DebugLogger = (entry: DebugLogInput) => void;

const REDACTED = '<REDACTED>';
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 120;
const MAX_OBJECT_KEYS = 200;
const MAX_STRING_LENGTH = 12000;
const SENSITIVE_KEY_RE =
  /authorization|cookie|password|passwd|pwd|token|secret|api[-_]?key|jwt|credential/i;

export function createDebugLogger(config: Config): DebugLogger {
  return function logDebug(entry): void {
    if (!config.debugLogEnabled) return;
    try {
      fs.mkdirSync(path.dirname(config.debugLogPath), { recursive: true });
      const fullEntry = sanitizeForDebugLog({
        timestamp: new Date().toISOString(),
        ...entry,
      }) as DebugLogEntry;
      fs.appendFileSync(
        config.debugLogPath,
        `${formatDebugLogEntry(fullEntry)}\n\n`,
        'utf8'
      );
    } catch (e) {
      console.warn('[debugLog] 写入调试日志失败', e);
    }
  };
}

function formatDebugLogEntry(entry: DebugLogEntry): string {
  const title = buildEntryTitle(entry);
  const lines = [
    `${entry.timestamp} ${entry.level === 'error' ? '错误' : '调试'} - ${title}`,
  ];
  const context = formatContext(entry);
  if (context) lines.push(`上下文: ${context}`);
  lines.push(...buildEntryDetails(entry));
  return lines.join('\n');
}

function buildEntryTitle(entry: DebugLogEntry): string {
  if (entry.type === 'http_request') {
    return `HTTP 请求完成: ${entry.method ?? '?'} ${entry.path ?? '?'} -> ${entry.statusCode ?? '?'} (${entry.durationMs ?? '?'}ms)`;
  }
  if (entry.type === 'chat_send_user_message') {
    return `收到用户消息: ${formatText(entry.userMessage)}`;
  }
  if (entry.type === 'ai_route_input') return '准备进行 AI 路由判断';
  if (entry.type === 'ai_route_output') return 'AI 路由判断完成';
  if (entry.type === 'ai_provider_route_input') {
    return `调用 AI 路由接口: provider=${entry.provider ?? '?'}`;
  }
  if (entry.type === 'ai_provider_route_output') {
    const decision = toRecord(entry.decision);
    return `AI 路由接口返回: skill=${decision?.skillName ?? '?'}`;
  }
  if (entry.type === 'ai_provider_route_error') {
    return `AI 路由接口失败: provider=${entry.provider ?? '?'}`;
  }
  if (entry.type === 'chat_route_decision') {
    const decision = toRecord(entry.decision);
    return `聊天调度决策: skill=${decision?.skillName ?? '?'}`;
  }
  if (entry.type === 'chat_assistant_message_created') {
    return `创建 assistant 消息占位: messageId=${entry.messageId ?? '?'}`;
  }
  if (entry.type === 'ai_chat_input') {
    return `调用 AI 聊天接口: provider=${entry.provider ?? '?'}`;
  }
  if (entry.type === 'ai_chat_output') {
    return `AI 聊天最终输出: provider=${entry.provider ?? '?'} (${entry.durationMs ?? '?'}ms)`;
  }
  if (entry.type === 'ai_chat_error') {
    return `AI 聊天接口失败: provider=${entry.provider ?? '?'}`;
  }
  if (entry.type === 'skill_run_started') {
    return `Skill 开始运行: ${entry.skillName ?? '?'}`;
  }
  if (entry.type === 'skill_run_finished') {
    return `Skill 运行完成: ${entry.skillName ?? '?'} (${entry.latencyMs ?? '?'}ms)`;
  }
  if (entry.type === 'skill_run_failed') {
    return `Skill 运行失败: ${entry.skillName ?? '?'}`;
  }
  if (entry.type === 'skill_run_crashed') {
    return `Skill 后台任务崩溃: ${entry.skillName ?? '?'}`;
  }
  if (entry.type === 'skill_event_error') {
    return `Skill 返回错误事件: ${entry.skillName ?? '?'}`;
  }
  if (entry.type === 'workflow_state_transition') {
    return `工作流状态变化: ${entry.fromLearningState ?? '?'} -> ${entry.nextLearningState ?? '?'}`;
  }
  if (entry.type === 'workflow_mode_switch') {
    return `输入模式切换: ${entry.mode ?? '?'}`;
  }
  return `调试事件: ${entry.type}`;
}

function buildEntryDetails(entry: DebugLogEntry): string[] {
  switch (entry.type) {
    case 'http_request':
      return [
        `请求: query=${formatValue(entry.requestQuery)}, body=${formatValue(entry.requestBody)}`,
        `客户端: ${formatText(entry.userAgent)}; contentType=${entry.contentType ?? '未提供'}; contentLength=${entry.contentLength ?? '未提供'}`,
      ];
    case 'chat_send_user_message':
      return [
        `用户输入: ${formatText(entry.userMessage)}`,
        `消息类型: ${entry.userMessageRole ?? 'user'} / ${entry.userMessageType ?? 'text'}`,
        `请求体: ${formatValue(entry.requestBody)}`,
      ];
    case 'ai_route_input':
    case 'ai_provider_route_input':
      return formatRouteInput(entry.input);
    case 'ai_route_output':
    case 'ai_provider_route_output':
    case 'chat_route_decision':
      return formatDecision(entry.decision);
    case 'ai_provider_route_error':
    case 'ai_chat_error':
      return [`错误: ${formatError(entry.error)}`];
    case 'ai_chat_input':
      return formatChatRequest(entry.request);
    case 'ai_chat_output':
      return [
        `最终文本: ${formatText(entry.text)}`,
        `工具调用: ${formatToolUses(entry.toolUses)}`,
        `流式分片: textDelta=${entry.textDeltaChunks ?? 0}, totalEvents=${entry.streamEventCount ?? 0}`,
      ];
    case 'skill_run_started':
      return [`调度参数: ${formatDecision(entry.decision)}`];
    case 'skill_run_finished':
      return [
        `结果: status=${entry.status ?? 'done'}, finalSeq=${entry.finalSeq ?? '?'}, textLength=${entry.textLength ?? 0}`,
        `事件摘要: ${formatValue(entry.eventCounts)}`,
        `assistant 最终文本: ${formatText(entry.assistantText)}`,
      ];
    case 'skill_run_failed':
      return [
        `错误: ${entry.errorName ?? 'Error'} - ${entry.errorMessage ?? 'unknown'}`,
        `调试信息: ${formatValue(entry.debug)}`,
      ];
    case 'skill_run_crashed':
      return [`错误: ${formatError(entry.error)}`];
    case 'skill_event_error':
      return [`错误事件: ${formatValue(entry.errorEvent)}`];
    case 'workflow_state_transition':
      return [
        `从 ${entry.fromLearningState ?? '?'} 切到 ${entry.nextLearningState ?? '?'}`,
        `新的 activeSkill: ${entry.nextActiveSkill ?? '无'}`,
      ];
    case 'workflow_mode_switch':
      return [`新的输入模式: ${entry.mode ?? '?'}`];
    default:
      return formatRemainingFields(entry);
  }
}

function formatContext(entry: DebugLogEntry): string {
  return [
    entry.traceId ? `trace=${entry.traceId}` : '',
    entry.userId != null ? `user=${entry.userId}` : '',
    entry.conversationId != null ? `conversation=${entry.conversationId}` : '',
    entry.messageId != null ? `message=${entry.messageId}` : '',
    entry.streamId ? `stream=${entry.streamId}` : '',
    entry.runId ? `run=${entry.runId}` : '',
    entry.skillName ? `skill=${entry.skillName}` : '',
    entry.learningState ? `state=${entry.learningState}` : '',
    entry.phase ? `phase=${entry.phase}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function formatRouteInput(input: unknown): string[] {
  const data = toRecord(input);
  if (!data) return [`路由输入: ${formatValue(input)}`];
  return [
    `用户文本: ${formatText(data.userText)}`,
    `当前状态: ${data.currentLearningState ?? '未知'}`,
    `可用 Skill: ${formatValue(data.availableSkills)}`,
  ];
}

function formatDecision(decisionValue: unknown): string[] {
  const decision = toRecord(decisionValue);
  if (!decision) return [`决策: ${formatValue(decisionValue)}`];
  return [
    `目标 Skill: ${decision.skillName ?? '未知'}`,
    `置信度: ${decision.confidence ?? '未知'}`,
    `原因: ${formatText(decision.rationale)}`,
    `参数: ${formatValue(decision.params)}`,
  ];
}

function formatChatRequest(requestValue: unknown): string[] {
  const request = toRecord(requestValue);
  if (!request) return [`AI 请求: ${formatValue(requestValue)}`];
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const lastUser = [...messages]
    .reverse()
    .map((msg) => toRecord(msg))
    .find((msg) => msg?.role === 'user');
  const tools = Array.isArray(request.tools)
    ? request.tools
        .map((tool) => toRecord(tool)?.name)
        .filter((name): name is string => typeof name === 'string')
    : [];
  return [
    `System 提示: ${formatText(request.system, 800)}`,
    `历史消息: ${messages.length} 条; 最后一条用户消息: ${formatText(lastUser?.content)}`,
    `工具: ${tools.length > 0 ? tools.join(', ') : '无'}; toolChoice=${request.toolChoice ?? '未指定'}; maxTokens=${request.maxTokens ?? '未指定'}`,
  ];
}

function formatToolUses(toolUsesValue: unknown): string {
  if (!Array.isArray(toolUsesValue) || toolUsesValue.length === 0) return '无';
  return toolUsesValue
    .map((toolUse, index) => {
      const item = toRecord(toolUse);
      if (!item) return `#${index + 1}: ${formatValue(toolUse)}`;
      return `#${index + 1} ${item.toolName ?? 'unknown'} 输入 ${formatValue(item.input)}`;
    })
    .join('; ');
}

function formatRemainingFields(entry: DebugLogEntry): string[] {
  const ignored = new Set([
    'timestamp',
    'level',
    'type',
    'traceId',
    'userId',
    'conversationId',
    'messageId',
    'streamId',
    'runId',
    'skillName',
    'learningState',
    'phase',
  ]);
  const details = Object.entries(entry)
    .filter(([key]) => !ignored.has(key))
    .map(([key, value]) => `${key}=${formatValue(value)}`);
  return details.length > 0 ? [`详情: ${details.join('; ')}`] : [];
}

function formatError(value: unknown): string {
  const error = toRecord(value);
  if (!error) return formatValue(value);
  return `${error.name ?? 'Error'}: ${error.message ?? formatValue(value)}`;
}

function formatText(value: unknown, max = 2000): string {
  if (value == null || value === '') return '无';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '无';
  return text.length > max
    ? `${text.slice(0, max)}...(省略 ${text.length - max} 字符)`
    : text;
}

function formatValue(value: unknown, depth = 0): string {
  if (value == null) return '无';
  if (typeof value === 'string') return formatText(value, 600);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    if (value.length === 0) return '空';
    if (depth >= 2) return `${value.length} 项`;
    return `${value.length} 项: ${value
      .slice(0, 8)
      .map((item) => formatValue(item, depth + 1))
      .join('; ')}${value.length > 8 ? `; 另有 ${value.length - 8} 项` : ''}`;
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '对象';
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '空';
    return entries
      .slice(0, 12)
      .map(([key, item]) => `${key}: ${formatValue(item, depth + 1)}`)
      .join('; ');
  }
  return String(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function sanitizeForDebugLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MaxDepth]';
  if (value == null) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;

  if (Array.isArray(value)) {
    const out = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForDebugLog(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      out.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
    }
    return out;
  }

  if (typeof value === 'object') {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...(value.cause ? { cause: sanitizeForDebugLog(value.cause, depth + 1) } : {}),
      };
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
      out[key] = SENSITIVE_KEY_RE.test(key)
        ? REDACTED
        : sanitizeForDebugLog(item, depth + 1);
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      out.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    }
    return out;
  }

  return String(value);
}

export function debugRequestLogger(config: Config, logDebug: DebugLogger) {
  return function debugRequestLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!config.debugLogEnabled) {
      next();
      return;
    }

    const startedAt = Date.now();
    res.on('finish', () => {
      logDebug({
        level: res.statusCode >= 500 ? 'error' : 'debug',
        type: 'http_request',
        traceId: req.traceId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        ...(req.user ? { userId: req.user.id } : {}),
        requestQuery: req.query,
        requestBody: req.body,
        userAgent: req.get('user-agent'),
        contentType: req.get('content-type'),
        contentLength: req.get('content-length'),
      });
    });
    next();
  };
}

export function debugFromContext(
  debug: DebugContext | undefined
): Pick<
  DebugLogEntry,
  | 'traceId'
  | 'userId'
  | 'conversationId'
  | 'messageId'
  | 'streamId'
  | 'runId'
  | 'skillName'
  | 'learningState'
  | 'phase'
> {
  return {
    ...(debug?.traceId ? { traceId: debug.traceId } : {}),
    ...(debug?.userId ? { userId: debug.userId } : {}),
    ...(debug?.conversationId ? { conversationId: debug.conversationId } : {}),
    ...(debug?.messageId ? { messageId: debug.messageId } : {}),
    ...(debug?.streamId ? { streamId: debug.streamId } : {}),
    ...(debug?.runId ? { runId: debug.runId } : {}),
    ...(debug?.skillName ? { skillName: debug.skillName } : {}),
    ...(debug?.learningState ? { learningState: debug.learningState } : {}),
    ...(debug?.phase ? { phase: debug.phase } : {}),
  };
}
