/**
 * 全局错误处理
 *
 * 捕获 zod ZodError、自定义 HttpError、其他兜底 500。
 * 响应体始终 { error: { code, message, details? } }。
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, type ErrorCode } from '../../shared/errors.js';
import { getDevErrorDetails } from '../utils/devError.js';
import type { DebugLogger } from '../utils/debugLog.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  const traceId = req.traceId;

  if (err instanceof ZodError) {
    const logDebug = req.app.get('debugLogger') as DebugLogger | undefined;
    logDebug?.({
      level: 'error',
      type: 'handled_error',
      traceId,
      method: req.method,
      path: req.path,
      statusCode: 400,
      errorCode: ERROR_CODES.VALIDATION_FAILED,
      errorName: 'ZodError',
      errorMessage: '请求参数校验失败',
      errorDetails: err.issues,
    });
    res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '请求参数校验失败',
        details: {
          issues: err.issues,
          ...(traceId ? { traceId } : {}),
        },
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    const debug = getDevErrorDetails(err);
    const details =
      err.details || debug
        ? {
            ...(err.details ?? {}),
            ...(traceId ? { traceId } : {}),
            ...(debug ? { debug } : {}),
          }
        : undefined;
    const logDebug = req.app.get('debugLogger') as DebugLogger | undefined;
    logDebug?.({
      level: err.status >= 500 ? 'error' : 'debug',
      type: 'handled_error',
      traceId,
      method: req.method,
      path: req.path,
      statusCode: err.status,
      errorCode: err.code,
      errorName: err.name,
      errorMessage: err.message,
      errorDetails: err.details,
      debug,
    });
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(details ? { details } : {}),
      },
    });
    return;
  }

  console.error('[errorHandler] 未捕获错误', err);
  const details = getDevErrorDetails(err);
  const logDebug = req.app.get('debugLogger') as DebugLogger | undefined;
  logDebug?.({
    level: 'error',
    type: 'unhandled_error',
    traceId,
    method: req.method,
    path: req.path,
    statusCode: 500,
    errorCode: ERROR_CODES.INTERNAL_ERROR,
    errorName: err instanceof Error ? err.name : undefined,
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error ? err.stack : undefined,
    debug: details,
  });
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        err instanceof Error ? err.message : '服务器内部错误',
      ...(details || traceId
        ? {
            details: {
              ...(details ?? {}),
              ...(traceId ? { traceId } : {}),
            },
          }
        : {}),
    },
  });
}
