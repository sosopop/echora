/**
 * 全局错误处理
 *
 * 捕获 zod ZodError、自定义 HttpError、其他兜底 500。
 * 响应体始终 { error: { code, message, details? } }。
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, type ErrorCode } from '../../shared/errors.js';

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
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '请求参数校验失败',
        details: { issues: err.issues },
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  console.error('[errorHandler] 未捕获错误', err);
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        err instanceof Error ? err.message : '服务器内部错误',
    },
  });
}
