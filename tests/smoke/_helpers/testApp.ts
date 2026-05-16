/**
 * 测试用 app 装配 helper
 *
 * 给所有 smoke 测试脚本(run-smoke.ts / run-smoke-onboarding.ts)共用,
 * 减少重复样板。每次调用产出独立 DB + 独立端口的 app 实例。
 *
 * 用法:
 *   const app = await startTestApp({ provider: customProvider });
 *   try {
 *     // 用 app.baseUrl + fetch 跑测试
 *   } finally {
 *     await app.cleanup();
 *   }
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Server } from 'node:http';
import { connect, closeDb, type Db } from '../../../server/db/connect.js';
import { migrate } from '../../../server/db/migrate.js';
import { registerAllSkills } from '../../../server/skills/registry.js';
import { createProvider } from '../../../server/ai/providers/index.js';
import { createAIRouter } from '../../../server/ai/router.js';
import { createApp } from '../../../server/createApp.js';
import type { AIProvider } from '../../../server/ai/types.js';
import type { Config } from '../../../server/config/getConfig.js';

export interface TestAppHandle {
  baseUrl: string;
  db: Db;
  cleanup(): Promise<void>;
}

export interface StartTestAppOptions {
  /** 自定义 provider(默认 stub)。同时也会被 createAIRouter 使用 */
  provider?: AIProvider;
  /** 配置覆盖,会覆盖默认 testConfig 的对应字段 */
  configOverrides?: Partial<Config>;
  /** 临时目录前缀,默认 'echora-smoke-' */
  tmpPrefix?: string;
}

const DEFAULT_TEST_CONFIG: Config = {
  port: 0,
  databasePath: '',
  jwtSecret: 'test-secret',
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

export async function startTestApp(
  opts: StartTestAppOptions = {}
): Promise<TestAppHandle> {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), opts.tmpPrefix ?? 'echora-smoke-')
  );
  const dbPath = path.join(tmpDir, 'test.db');
  const db = connect(dbPath);
  migrate(db);

  const skillRegistry = await registerAllSkills();

  const config: Config = {
    ...DEFAULT_TEST_CONFIG,
    databasePath: dbPath,
    ...opts.configOverrides,
  };

  const provider = opts.provider ?? createProvider(config);
  const aiRouter = createAIRouter(provider, skillRegistry);
  const app = createApp({ config, db, skillRegistry, aiRouter, provider });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('startTestApp: 无法获取端口');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const cleanup = async (): Promise<void> => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb(db);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* Windows 文件锁,忽略 */
    }
  };

  return { baseUrl, db, cleanup };
}
