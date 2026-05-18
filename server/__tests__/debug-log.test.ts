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

let app: Application;
let db: Db;
let tmpDir: string;
let debugLogPath: string;
let token: string;
let conversationId: number;

function readEntries(): Array<Record<string, unknown>> {
  const text = fs.readFileSync(debugLogPath, 'utf8').trim();
  return text.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
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
    learningState: 'scene_selecting',
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
  const aiRouter = createAIRouter(provider, skillRegistry);
  app = createApp({ config, db, skillRegistry, aiRouter, provider });
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
    process.env.NODE_ENV = 'test';
    resetConfigCache();
    expect(getConfig({ reload: true }).debugLogEnabled).toBe(true);

    process.env.NODE_ENV = 'production';
    resetConfigCache();
    expect(getConfig({ reload: true }).debugLogEnabled).toBe(false);

    process.env.DEBUG_LOG_ENABLED = 'true';
    resetConfigCache();
    expect(getConfig({ reload: true }).debugLogEnabled).toBe(true);
  });

  it('记录聊天内容、AI 输入输出和工作流事件', async () => {
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
    await new Promise((resolve) => setTimeout(resolve, 20));

    const entries = readEntries();
    const types = entries.map((entry) => entry.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'http_request',
        'chat_send_user_message',
        'ai_route_input',
        'ai_provider_route_input',
        'ai_provider_route_output',
        'chat_route_decision',
        'skill_run_started',
        'ai_chat_input',
        'ai_chat_event',
        'ai_chat_output',
        'skill_event',
        'skill_run_finished',
      ])
    );

    const userEntry = entries.find((entry) => entry.type === 'chat_send_user_message');
    expect(userEntry).toMatchObject({
      traceId: 'trace-debug-log',
      conversationId,
      userMessage: 'hello debug',
    });
    expect((userEntry?.requestBody as { password?: unknown }).password).toBe(
      '<REDACTED>'
    );

    const chatInput = entries.find((entry) => entry.type === 'ai_chat_input');
    expect(JSON.stringify(chatInput)).toContain('hello debug');
    const chatOutput = entries.find((entry) => entry.type === 'ai_chat_output');
    expect(chatOutput).toMatchObject({ text: '收到:hello debug' });
  });
});
