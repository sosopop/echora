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

export type DebugLogger = (entry: Omit<DebugLogEntry, 'timestamp'>) => void;

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
      const fullEntry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        ...entry,
      };
      fs.appendFileSync(
        config.debugLogPath,
        `${JSON.stringify(sanitizeForDebugLog(fullEntry))}\n`,
        'utf8'
      );
    } catch (e) {
      console.warn('[debugLog] 写入调试日志失败', e);
    }
  };
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
