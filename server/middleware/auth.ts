/**
 * JWT 中间件
 *
 * 从 Authorization: Bearer <token> 解析。
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Config } from '../config/getConfig.js';
import { ERROR_CODES } from '../../shared/errors.js';

export interface AuthedUser {
  id: number;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      traceId?: string;
    }
  }
}

interface JwtPayload {
  id: number;
  email: string;
  iat?: number;
  exp?: number;
}

export function signToken(user: AuthedUser, secret: string): string {
  return jwt.sign({ id: user.id, email: user.email }, secret, {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string, secret: string): AuthedUser | null {
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (typeof decoded === 'string' || !decoded.id || !decoded.email) {
      return null;
    }
    return { id: decoded.id, email: decoded.email };
  } catch {
    return null;
  }
}

export function requireAuth(config: Config) {
  return function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    req.traceId ??= req.headers['x-request-id']
      ? String(req.headers['x-request-id'])
      : req.headers['x-trace-id']
        ? String(req.headers['x-trace-id'])
        : undefined;
    const header = req.headers.authorization ?? '';
    let token: string | undefined;
    if (header.startsWith('Bearer ')) {
      token = header.substring('Bearer '.length).trim();
    }
    if (!token) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: '缺少访问令牌',
          ...(req.traceId ? { details: { traceId: req.traceId } } : {}),
        },
      });
      return;
    }

    const user = verifyToken(token, config.jwtSecret);
    if (!user) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.TOKEN_EXPIRED,
          message: '访问令牌无效或已过期',
          ...(req.traceId ? { details: { traceId: req.traceId } } : {}),
        },
      });
      return;
    }

    req.user = user;
    next();
  };
}
