/**
 * 占位测试:GET /api/health 返 200 + { ok: true }
 *
 * 真实业务测试后续按 routes / services 拆分覆盖。
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

let app: Application;
let db: Db;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  db = connect(dbPath);
  migrate(db);

  const skillRegistry = await registerAllSkills();
  const config = {
    port: 0,
    databasePath: dbPath,
    jwtSecret: 'test-secret',
    aiProvider: 'stub' as const,
    anthropicApiKey: null,
    corsOrigin: ['http://localhost'],
    nodeEnv: 'test',
  };
  const provider = createProvider(config);
  const aiRouter = createAIRouter(provider, skillRegistry);
  app = createApp({ config, db, skillRegistry, aiRouter });
});

afterAll(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

describe('GET /api/health', () => {
  it('返回 200 + { ok: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
