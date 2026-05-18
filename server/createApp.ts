/**
 * 装配 Express 应用
 *
 * createApp(deps) 返回 app,不调 listen。便于 supertest 注入。
 */

import express, { type Application } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type { Db } from './db/connect.js';
import type { Config } from './config/getConfig.js';
import type { SkillRegistry } from './skills/registry.js';
import type { AIRouter } from './ai/router.js';
import type { AIProvider } from './ai/types.js';
import { createAuthRouter } from './routes/auth.js';
import { createChatRouter } from './routes/chat.js';
import { createProfileRouter } from './routes/profile.js';
import { errorHandler } from './middleware/error.js';

export interface AppDeps {
  config: Config;
  db: Db;
  skillRegistry: SkillRegistry;
  aiRouter: AIRouter;
  provider: AIProvider;
}

export function createApp(deps: AppDeps): Application {
  const app = express();
  const { config } = deps;

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use((req, res, next) => {
    const headerValue = req.headers['x-request-id'] ?? req.headers['x-trace-id'];
    const traceId =
      typeof headerValue === 'string' && headerValue.trim()
        ? headerValue.trim()
        : randomUUID();
    req.traceId = traceId;
    res.setHeader('X-Request-Id', traceId);
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // —— Health ————————————————————————————————————————————
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0', provider: deps.skillRegistry ? 'ready' : 'unknown' });
  });

  // —— 业务路由 ——————————————————————————————————————————
  app.use('/api/auth', createAuthRouter({ db: deps.db, config }));
  app.use('/api/profile', createProfileRouter({ db: deps.db, config }));
  app.use(
    '/api/chat',
    createChatRouter({
      db: deps.db,
      config,
      skillRegistry: deps.skillRegistry,
      aiRouter: deps.aiRouter,
      provider: deps.provider,
    })
  );

  // —— 错误处理(必须最后) ——————————————————————————————
  app.use(errorHandler);

  return app;
}
