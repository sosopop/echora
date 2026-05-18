/**
 * 副作用:POST /api/auth/register 后,user_profiles 表必有对应行(空 profile)。
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
    debugLogEnabled: false,
    debugLogPath: path.join(tmpDir, 'debug.log'),
    aiProvider: 'stub',
    anthropicApiKey: null,
    anthropicBaseURL: 'https://api.anthropic.com',
    anthropicModel: 'claude-sonnet-4-6',
    openaiApiKey: null,
    openaiBaseURL: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o-mini',
    corsOrigin: ['http://localhost'],
    nodeEnv: 'test',
  };
  const provider = createProvider(config);
  const aiRouter = createAIRouter(provider, skillRegistry);
  app = createApp({ config, db, skillRegistry, aiRouter, provider });
});

afterAll(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

describe('POST /api/auth/register 副作用', () => {
  it('成功后 user_profiles 表存在对应行', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'side@test.com', password: 'echora1234' });
    expect(reg.status).toBe(201);
    const userId = reg.body.data.user.id;

    const row = db
      .prepare('SELECT * FROM user_profiles WHERE user_id = ?')
      .get(userId) as { user_id: number; weakness_tags: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.user_id).toBe(userId);
    // 空 array JSON 字段
    expect(row?.weakness_tags).toBe('[]');
  });
});
