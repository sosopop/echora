/**
 * chat 路由:练习态自由文本答案兜底 + 用户消息落库文案。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Application } from 'express';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { createApp } from '../createApp.js';
import { SkillRegistry } from '../skills/registry.js';
import { signToken } from '../middleware/auth.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage, getMessages } from '../services/message.js';
import {
  createAttempt,
  markGraded,
} from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import { updateLearningState } from '../services/conversation.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import type { Config } from '../config/getConfig.js';
import type { AIRouter } from '../ai/router.js';
import type { AIProvider } from '../ai/types.js';
import type {
  LearningState,
  RouterDecision,
  Skill,
  SkillEventInput,
} from '../../shared/skill.js';

let app: Application;
let db: Db;
let tmpDir: string;
let userId: number;
let token: string;
let conversationId: number;
let decideCalls: Array<{ userText: string }> = [];

const config: Config = {
  port: 0,
  databasePath: ':memory:',
  jwtSecret: 'chat-route-test-secret',
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

function fakeSkill(
  name: string,
  allowedStates: LearningState[]
): Skill {
  return {
    name,
    description: `fake ${name}`,
    allowedStates,
    async *handler(): AsyncIterable<SkillEventInput> {
      yield { type: 'done', payload: {} };
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-chat-route-'));
  const dbPath = path.join(tmpDir, 'test.db');
  db = connect(dbPath);
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('chat-route@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  token = signToken({ id: userId, email: 'chat-route@test.com' }, config.jwtSecret);
  const conv = createConversation(db, userId, { learningState: 'practicing' });
  conversationId = conv.id;
  decideCalls = [];

  const skillRegistry = new SkillRegistry();
  skillRegistry.register(fakeSkill('grade', ['practicing', 'grading']));
  skillRegistry.register(
    fakeSkill('practice', ['scene_selecting', 'practicing', 'awaiting_next'])
  );
  skillRegistry.register(
    fakeSkill('scene-select', [
      'scene_selecting',
      'awaiting_next',
      'reviewing',
      'practicing',
    ])
  );
  const aiRouter: AIRouter = {
    async decide(input): Promise<RouterDecision> {
      decideCalls.push({ userText: input.userText });
      return {
        skillName: 'practice',
        params: {},
        confidence: 0.95,
        rationale: 'test fallback',
      };
    },
  };
  const provider: AIProvider = {
    name: 'test-provider',
    async route() {
      throw new Error('route is not used');
    },
  };
  app = createApp({ config: { ...config, databasePath: dbPath }, db, skillRegistry, aiRouter, provider });
});

afterEach(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

function seedAttempt(): number {
  const msg = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'practice',
  });
  const attempt = createAttempt(db, {
    conversationId,
    messageId: msg.id,
    sceneId: 'restaurant',
    stage: 2,
    questionNo: 1,
    questionType: 'sentence_translation',
    prompt: 'Translate to English: "谢谢"',
  });
  return attempt.id;
}

describe('POST /api/chat/send', () => {
  it('practicing 中自由文本绑定最新未批改 attempt 并走 grade', async () => {
    const attemptId = seedAttempt();

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: 'Thank you.' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'grade',
      params: {
        action: {
          type: 'submit-answer',
          payload: { attemptId, answer: 'Thank you.' },
        },
      },
    });
    expect(decideCalls).toHaveLength(0);
    const user = getMessages(db, conversationId).find((m) => m.role === 'user');
    expect(user?.content).toBe('Thank you.');
  });

  it('最新 attempt 已正确通过后,go 直接走下一题', async () => {
    const attemptId = seedAttempt();
    createGrading(db, {
      attemptId,
      score: 90,
      isCorrect: true,
      corrections: { explanation: '通过' },
    });
    markGraded(db, attemptId);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: 'go' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'practice',
      params: { action: { type: 'next-question' } },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('练习控制指令不会被误包装成答案,而是走下一题', async () => {
    seedAttempt();

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '出题' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'practice',
      params: { action: { type: 'next-question' } },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('practicing 中换场景直接走场景选择,不会绕回 AI Router', async () => {
    seedAttempt();

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '换场景' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'scene-select',
      params: { action: { type: 'request-new-scenes' } },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('awaiting_next 中 START 直接进入换场景', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: 'START' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'scene-select',
      params: { action: { type: 'request-new-scenes' } },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('直接输入答案只绑定当前活跃场景 attempt', async () => {
    const oldAttemptId = seedAttempt();
    createSceneDialogue(db, {
      userId,
      conversationId,
      sceneId: 'shopping',
      title: '买衣服',
      difficulty: 'A1',
      roles: ['Customer', 'Clerk'],
      turns: [{ role: 'Customer', en: 'Thanks.', zh: '谢谢。' }],
    });

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: 'Thanks.' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision.skillName).toBe('practice');
    expect(res.body.data.decision.params).not.toMatchObject({
      action: {
        type: 'submit-answer',
        payload: { attemptId: oldAttemptId },
      },
    });
    expect(decideCalls).toEqual([{ userText: 'Thanks.' }]);
  });

  it('submit-answer action 的用户消息落真实答案', async () => {
    const attemptId = seedAttempt();

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId,
        action: {
          type: 'submit-answer',
          payload: { attemptId, answer: 'A cup of water, please.' },
        },
      });

    expect(res.status).toBe(202);
    const user = getMessages(db, conversationId).find((m) => m.role === 'user');
    expect(user?.content).toBe('A cup of water, please.');
  });
});
