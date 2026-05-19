import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Application } from 'express';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { createApp } from '../createApp.js';
import { createAIRouter } from '../ai/router.js';
import { signToken } from '../middleware/auth.js';
import { SkillRegistry } from '../skills/registry.js';
import { generalChatSkill } from '../skills/generalChat.js';
import type { AIProvider, ChatStreamEvent } from '../ai/types.js';
import type { Config } from '../config/getConfig.js';
import { getConfig, resetConfigCache } from '../config/getConfig.js';
import { createConversation } from '../services/conversation.js';
import { createDebugLogger } from '../utils/debugLog.js';

let app: Application;
let db: Db;
let tmpDir: string;
let debugLogPath: string;
let token: string;
let conversationId: number;
let logDebug: ReturnType<typeof createDebugLogger>;

function readLogText(): string {
  return fs.existsSync(debugLogPath) ? fs.readFileSync(debugLogPath, 'utf8') : '';
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-debug-log-'));
  const dbPath = path.join(tmpDir, 'test.db');
  debugLogPath = path.join(tmpDir, 'debug.log');
  db = connect(dbPath);
  migrate(db);
  const user = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('debug@test.com', 'x');
  const userId = Number(user.lastInsertRowid);
  token = signToken({ id: userId, email: 'debug@test.com' }, 'debug-secret');
  conversationId = createConversation(db, userId, {
    learningState: 'awaiting_next',
  }).id;

  const config: Config = {
    port: 0,
    databasePath: dbPath,
    jwtSecret: 'debug-secret',
    debugLogEnabled: true,
    debugLogPath,
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
  logDebug = createDebugLogger(config);
  const skillRegistry = new SkillRegistry();
  skillRegistry.register(generalChatSkill);
  const provider: AIProvider = {
    name: 'debug-provider',
    async route() {
      return {
        skillName: 'general-chat',
        params: {},
        confidence: 0.9,
        rationale: 'unit test route',
      };
    },
    async *chat(req): AsyncIterable<ChatStreamEvent> {
      yield {
        type: 'text-delta',
        text: `收到:${req.messages.at(-1)?.content ?? ''}`,
      };
      yield { type: 'message-stop', stopReason: 'end_turn' };
    },
  };
  const aiRouter = createAIRouter(provider, skillRegistry, logDebug);
  app = createApp({ config, db, skillRegistry, aiRouter, provider, logDebug });
});

afterEach(() => {
  closeDb(db);
  resetConfigCache();
  delete process.env.NODE_ENV;
  delete process.env.DEBUG_LOG_ENABLED;
  delete process.env.DEBUG_LOG_PATH;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

describe('debug log', () => {
  it('测试环境默认打开,生产环境默认关闭,且 env 可覆盖', () => {
    const previousEnabled = process.env.DEBUG_LOG_ENABLED;
    const previousCamelEnabled = process.env.debugLogEnabled;
    const previousConfigPath = process.env.SERVER_CONFIG_PATH;
    delete process.env.DEBUG_LOG_ENABLED;
    delete process.env.debugLogEnabled;
    delete process.env.SERVER_CONFIG_PATH;
    process.env.NODE_ENV = 'test';
    resetConfigCache();
    expect(getConfig({ reload: true }).debugLogEnabled).toBe(true);

    process.env.NODE_ENV = 'production';
    resetConfigCache();
    expect(getConfig({ reload: true }).debugLogEnabled).toBe(false);

    process.env.DEBUG_LOG_ENABLED = 'true';
    resetConfigCache();
    expect(getConfig({ reload: true }).debugLogEnabled).toBe(true);
    if (previousEnabled === undefined) {
      delete process.env.DEBUG_LOG_ENABLED;
    } else {
      process.env.DEBUG_LOG_ENABLED = previousEnabled;
    }
    if (previousCamelEnabled === undefined) {
      delete process.env.debugLogEnabled;
    } else {
      process.env.debugLogEnabled = previousCamelEnabled;
    }
    if (previousConfigPath === undefined) {
      delete process.env.SERVER_CONFIG_PATH;
    } else {
      process.env.SERVER_CONFIG_PATH = previousConfigPath;
    }
  });

  it('用自然语言记录聊天内容、AI 最终输入输出和工作流摘要', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', 'trace-debug-log')
      .send({
        conversationId,
        text: 'hello debug',
        password: 'should-hide',
      });

    expect(res.status).toBe(202);
    await waitForLogText(['HTTP 请求完成', 'AI 聊天最终输出', 'Skill 运行完成']);

    const text = readLogText();
    expect(text).toContain('收到用户消息: hello debug');
    expect(text).toContain('请求体: conversationId');
    expect(text).toContain('password: <REDACTED>');
    expect(text).toContain('调用 AI 聊天接口');
    expect(text).toContain('[user] hello debug');
    expect(text).toContain('AI 聊天最终输出');
    expect(text).toContain('最终文本: 收到:hello debug');
    expect(text).toContain('流式分片: textDelta=1');
    expect(text).toContain('Skill 运行完成');
    expect(text).toContain('assistant 最终文本: 收到:hello debug');

    expect(text).not.toContain('"type"');
    expect(text).not.toContain('ai_chat_event');
    expect(text).not.toContain('skill_event');
    expect(() => JSON.parse(text.split('\n')[0])).toThrow();
  });
});

async function waitForLogText(requiredFragments: string[]): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const text = readLogText();
    if (requiredFragments.every((fragment) => text.includes(fragment))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `调试日志未在超时内写全: ${requiredFragments.join(', ')}`
  );
}
