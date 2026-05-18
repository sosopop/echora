/**
 * /api/auth 路由
 *
 *   POST /register  { email, password }
 *   POST /login     { email, password }
 *   GET  /me        (需 token)
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Db } from '../db/connect.js';
import type { Config } from '../config/getConfig.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { ERROR_CODES } from '../../shared/errors.js';
import {
  ensureProfile,
  getProfile,
  isOnboardingComplete,
} from '../services/profile.js';
import type {
  AuthRegisterResp,
  AuthLoginResp,
  MeResp,
} from '../../shared/api.js';

const credentialsSchema = z.object({
  email: z.string().email('邮箱格式不合法'),
  password: z.string().min(8, '密码至少 8 位').max(128),
});

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
}

export function createAuthRouter(deps: { db: Db; config: Config }): Router {
  const router = Router();
  const { db, config } = deps;

  // —— 注册 ———————————————————————————————————————————————
  router.post('/register', (req, res, next) => {
    try {
      const { email, password } = credentialsSchema.parse(req.body);
      const exists = db
        .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
        .get(email);
      if (exists) {
        throw new HttpError(409, ERROR_CODES.EMAIL_EXISTS, '该邮箱已注册');
      }
      const hash = bcrypt.hashSync(password, 10);
      const id = db.transaction(() => {
        const result = db
          .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
          .run(email, hash);
        const newId = Number(result.lastInsertRowid);
        ensureProfile(db, newId);
        return newId;
      })();
      const token = signToken({ id, email }, config.jwtSecret);

      const body: AuthRegisterResp = { token, user: { id, email } };
      res.status(201).json({ data: body });
    } catch (e) {
      next(e);
    }
  });

  // —— 登录 ———————————————————————————————————————————————
  router.post('/login', (req, res, next) => {
    try {
      const { email, password } = credentialsSchema.parse(req.body);
      const row = db
        .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
        .get(email);
      if (!row) {
        throw new HttpError(
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          '邮箱或密码错误'
        );
      }
      const ok = bcrypt.compareSync(password, row.password_hash);
      if (!ok) {
        throw new HttpError(
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          '邮箱或密码错误'
        );
      }
      const token = signToken({ id: row.id, email: row.email }, config.jwtSecret);
      const body: AuthLoginResp = {
        token,
        user: { id: row.id, email: row.email },
      };
      res.json({ data: body });
    } catch (e) {
      next(e);
    }
  });

  // —— 当前用户 ——————————————————————————————————————————————
  router.get('/me', requireAuth(config, db), (req, res) => {
    const user = req.user!;
    const profile = getProfile(db, user.id);
    const body: MeResp = {
      id: user.id,
      email: user.email,
      profile,
      onboardingCompleted: isOnboardingComplete(profile),
    };
    res.json({ data: body });
  });

  return router;
}
