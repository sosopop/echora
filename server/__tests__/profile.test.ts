/**
 * profile 路由 + 服务测试
 *
 *   - register 后默认空 profile 已建
 *   - GET /api/profile 返回画像
 *   - PUT /api/profile 写入字段并持久化
 *   - PUT 非法 body 返 400
 *   - 未登录返 401
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Application } from 'express';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { registerAllSkills } from '../skills/registry.js';
import { createProvider } from '../ai/providers/index.js';
import { createAIRouter } from '../ai/router.js';
import { createApp } from '../createApp.js';
import type { Config } from '../config/getConfig.js';

let app: Application;
let db: Db;
let tmpDir: string;
let token: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  db = connect(dbPath);
  migrate(db);

  const skillRegistry = await registerAllSkills();
  const config: Config = {
    port: 0,
    databasePath: dbPath,
    jwtSecret: 'test-secret',
    aiProvider: 'stub',
    anthropicApiKey: null,
    anthropicBaseURL: 'https://api.anthropic.com',
    anthropicModel: 'claude-sonnet-4-6',
    corsOrigin: ['http://localhost'],
    nodeEnv: 'test',
  };
  const provider = createProvider(config);
  const aiRouter = createAIRouter(provider, skillRegistry);
  app = createApp({ config, db, skillRegistry, aiRouter, provider });

  // 注册一个用户拿 token
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email: 'pro@test.com', password: 'echora1234' });
  expect(reg.status).toBe(201);
  token = reg.body.data.token;
});

afterAll(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

describe('GET /api/profile', () => {
  it('register 后默认 profile 已建,字段全空', async () => {
    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBeGreaterThan(0);
    expect(res.body.data.name).toBeNull();
    expect(res.body.data.level).toBeNull();
    expect(res.body.data.weaknessTags).toEqual([]);
    expect(res.body.data.recentTopics).toEqual([]);
  });

  it('未登录返 401', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/profile', () => {
  it('partial 写入并持久化', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '小李', level: 'B1', weaknessTags: ['preposition'] });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('小李');
    expect(res.body.data.level).toBe('B1');
    expect(res.body.data.weaknessTags).toEqual(['preposition']);

    // 再 GET 验证
    const get = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(get.body.data.name).toBe('小李');
    expect(get.body.data.level).toBe('B1');
  });

  it('非法 level 返 400', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ level: 'X9' });
    expect(res.status).toBe(400);
  });

  it('未登录返 401', async () => {
    const res = await request(app).put('/api/profile').send({ name: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('返回 profile + onboardingCompleted', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).not.toBeNull();
    expect(res.body.data.profile.name).toBe('小李');
    expect(res.body.data.onboardingCompleted).toBe(true);
  });
});
