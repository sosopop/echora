/**
 * chat 路由:练习态自由文本答案兜底 + 用户消息落库文案。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { Application } from 'express';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { createApp } from '../createApp.js';
import { SkillRegistry } from '../skills/registry.js';
import { signToken } from '../middleware/auth.js';
import { createConversation } from '../services/conversation.js';
import {
  appendMessage,
  appendStreamEvent,
  getBranchMessages,
  getMessages,
} from '../services/message.js';
import {
  createAttempt,
  markGraded,
} from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import {
  archiveConversation,
  getConversation,
  updateLearningState,
} from '../services/conversation.js';
import {
  createSceneDialogue,
  getActiveSceneDialogue,
} from '../services/sceneDialogue.js';
import { getProfile, upsertProfile, ensureProfile } from '../services/profile.js';
import type { Config } from '../config/getConfig.js';
import type { AIRouter } from '../ai/router.js';
import type { AIProvider } from '../ai/types.js';
import type { ServerSkillContext } from '../skills/types.js';
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
let routerDecisionOverride: RouterDecision | null = null;
let providerChatImpl: AIProvider['chat'] | null = null;
let skillHandlerOverrides = new Map<
  string,
  (ctx: ServerSkillContext) => AsyncIterable<SkillEventInput>
>();

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
    async *handler(ctx): AsyncIterable<SkillEventInput> {
      const override = skillHandlerOverrides.get(name);
      if (override) {
        yield* override(ctx as ServerSkillContext);
        return;
      }
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
  routerDecisionOverride = null;
  providerChatImpl = null;
  skillHandlerOverrides = new Map();

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
  skillRegistry.register(
    fakeSkill('review', ['awaiting_next', 'reviewing', 'archived'])
  );
  skillRegistry.register(
    fakeSkill('explain', [
      'practicing',
      'grading',
      'awaiting_next',
      'reviewing',
      'scene_selecting',
    ])
  );
  skillRegistry.register(
    fakeSkill('retry', [
      'awaiting_next',
      'reviewing',
      'scene_selecting',
      'practicing',
    ])
  );
  skillRegistry.register(fakeSkill('general-chat', []));
  const aiRouter: AIRouter = {
    async decide(input): Promise<RouterDecision> {
      decideCalls.push({ userText: input.userText });
      return routerDecisionOverride ?? {
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
    async *chat(req) {
      if (!providerChatImpl) return;
      yield* providerChatImpl(req);
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

function seedGradingHistory(): {
  userMessageId: number;
  assistantMessageId: number;
} {
  const user = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'user',
    content: 'wrong answer with secret reference',
  });
  const assistant = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'grade',
    content: '参考表达是: Thank you.',
  });
  appendStreamEvent(db, assistant.id, {
    type: 'widget-init',
    payload: {
      widget: {
        id: 'grading-result-history',
        type: 'grading-result',
        status: 'loading',
        data: {},
        version: 1,
      },
    },
    seq: 1,
    streamId: 'history-stream',
    timestamp: 1,
  });
  appendStreamEvent(db, assistant.id, {
    type: 'widget-ready',
    payload: {
      widgetId: 'grading-result-history',
      patch: {
        status: 'ready',
        data: {
          attemptId: 1,
          score: 40,
          isCorrect: false,
          userAnswer: 'wrong answer with secret reference',
          referenceAnswer: 'Thank you.',
          explanation: '这里会泄露批改详情。',
          tags: ['missing_word'],
        },
      },
    },
    seq: 2,
    streamId: 'history-stream',
    timestamp: 2,
  });
  return { userMessageId: user.id, assistantMessageId: assistant.id };
}

function widgetSnapshotToArray(snapshot: unknown): Array<{ type?: string }> {
  return Array.isArray(snapshot)
    ? (snapshot as Array<{ type?: string }>)
    : snapshot
    ? [snapshot as { type?: string }]
    : [];
}

describe('GET /api/chat/conversations/:id/messages', () => {
  it('locked 历史隐藏用户答案与 grading-result 详情', async () => {
    const seeded = seedGradingHistory();

    const res = await request(app)
      .get(`/api/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const messages = res.body.data as Array<{
      id: number;
      content: string | null;
      widgetSnapshot: unknown;
    }>;
    expect(messages.find((m) => m.id === seeded.userMessageId)?.content).toBe(
      '完成当前题后查看完整答案'
    );
    const assistant = messages.find(
      (m) => m.id === seeded.assistantMessageId
    );
    expect(assistant?.content).toBe('');
    expect(widgetSnapshotToArray(assistant?.widgetSnapshot)[0]?.type).toBe(
      'conversation-lock'
    );
    expect(JSON.stringify(res.body.data)).not.toContain(
      'wrong answer with secret reference'
    );
    expect(JSON.stringify(res.body.data)).not.toContain('Thank you.');
    expect(JSON.stringify(res.body.data)).not.toContain('这里会泄露批改详情');
  });

  it('awaiting_next 解锁后历史消息恢复原始答案和批改详情', async () => {
    const seeded = seedGradingHistory();
    updateLearningState(db, conversationId, 'awaiting_next', null);

    const res = await request(app)
      .get(`/api/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const messages = res.body.data as Array<{
      id: number;
      content: string | null;
      widgetSnapshot: unknown;
    }>;
    expect(messages.find((m) => m.id === seeded.userMessageId)?.content).toBe(
      'wrong answer with secret reference'
    );
    const assistant = messages.find(
      (m) => m.id === seeded.assistantMessageId
    );
    expect(assistant?.content).toBe('参考表达是: Thank you.');
    expect(widgetSnapshotToArray(assistant?.widgetSnapshot)[0]?.type).toBe(
      'grading-result'
    );
  });
});

describe('branch follow-up threads', () => {
  it('支线消息落 branch_thread_id,不污染主线消息和学习态', async () => {
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'practice',
      content: 'Fill the blank: ____ me, where is the train station?',
    });

    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceMessageId: source.id,
        sourceRef: { kind: 'message', messageId: source.id },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({
      conversationId,
      sourceMessageId: source.id,
      sourceRef: { kind: 'message', messageId: source.id },
      status: 'open',
    });

    const threadId = createRes.body.data.id as number;
    const sendRes = await request(app)
      .post(`/api/chat/branch-threads/${threadId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '为什么这里用 Excuse me?' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.data.userMessage).toMatchObject({
      conversationId,
      branchThreadId: threadId,
      role: 'user',
      content: '为什么这里用 Excuse me?',
    });
    expect(sendRes.body.data.assistantMessage).toMatchObject({
      conversationId,
      branchThreadId: threadId,
      role: 'assistant',
      skillName: 'explain',
    });
    expect(sendRes.body.data.assistantMessage.content).toContain(
      '不会泄露标准答案'
    );

    const mainMessages = getMessages(db, conversationId);
    expect(mainMessages.map((m) => m.id)).toContain(source.id);
    expect(mainMessages.map((m) => m.id)).not.toContain(
      sendRes.body.data.userMessage.id
    );
    expect(getBranchMessages(db, threadId)).toHaveLength(2);
    expect(getConversation(db, conversationId, userId)?.learningState).toBe(
      'practicing'
    );
  });

  it('列表和详情接口只返回当前支线的消息', async () => {
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'practice',
      content: 'Practice source',
    });
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });
    const threadId = createRes.body.data.id as number;

    await request(app)
      .post(`/api/chat/branch-threads/${threadId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '解释一下' });

    const listRes = await request(app)
      .get(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual([
      expect.objectContaining({ id: threadId, sourceMessageId: source.id }),
    ]);

    const messagesRes = await request(app)
      .get(`/api/chat/branch-threads/${threadId}/messages`)
      .set('Authorization', `Bearer ${token}`);
    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.data).toHaveLength(2);
    expect(messagesRes.body.data.every(
      (m: { branchThreadId: number }) => m.branchThreadId === threadId
    )).toBe(true);
  });

  it('支线回复优先使用 provider.chat 并携带解锁态来源上下文', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'grade',
      content: "I'd like a steak, please.",
    });
    let capturedUserPrompt = '';
    providerChatImpl = async function* (req) {
      capturedUserPrompt = req.messages[0]?.content ?? '';
      yield { type: 'text-delta', text: '真实支线解释:' };
      yield { type: 'text-delta', text: 'would like 更礼貌。' };
      yield { type: 'message-stop', stopReason: 'end_turn' };
    };
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });

    const sendRes = await request(app)
      .post(`/api/chat/branch-threads/${createRes.body.data.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '为什么这样更礼貌?' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.data.assistantMessage.content).toBe(
      '真实支线解释:would like 更礼貌。'
    );
    expect(capturedUserPrompt).toContain("I'd like a steak, please.");
  });

  it('锁定态支线调用 provider 时不传来源正文', async () => {
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'practice',
      content: 'secret reference answer',
    });
    let capturedUserPrompt = '';
    providerChatImpl = async function* (req) {
      capturedUserPrompt = req.messages[0]?.content ?? '';
      yield { type: 'text-delta', text: '只给提示,不泄露答案。' };
    };
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });

    const sendRes = await request(app)
      .post(`/api/chat/branch-threads/${createRes.body.data.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '给我答案' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.data.assistantMessage.content).toBe(
      '只给提示,不泄露答案。'
    );
    expect(capturedUserPrompt).not.toContain('secret reference answer');
    expect(capturedUserPrompt).toContain('来源正文:已隐藏');
  });

  it('支线 provider.chat 会携带同一支线历史消息', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'grade',
      content: 'Use in for a time period.',
    });
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });
    const threadId = createRes.body.data.id as number;
    appendMessage(db, {
      conversationId,
      branchThreadId: threadId,
      type: 'text',
      role: 'user',
      content: '为什么 morning 前面用 in?',
    });
    appendMessage(db, {
      conversationId,
      branchThreadId: threadId,
      type: 'text',
      role: 'assistant',
      skillName: 'explain',
      content: '因为 morning 是一段时间。',
    });
    let capturedMessages: Array<{ role: string; content: string }> = [];
    providerChatImpl = async function* (req) {
      capturedMessages = req.messages;
      yield { type: 'text-delta', text: '继续解释。' };
    };

    const res = await request(app)
      .post(`/api/chat/branch-threads/${threadId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '那 Monday morning 呢?' });

    expect(res.status).toBe(201);
    expect(capturedMessages.map((m) => m.content)).toEqual([
      expect.stringContaining('Use in for a time period.'),
      '为什么 morning 前面用 in?',
      '因为 morning 是一段时间。',
      '那 Monday morning 呢?',
    ]);
  });

  it('provider.chat 失败时支线发送显式返回 502', async () => {
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      content: 'source',
    });
    providerChatImpl = async function* () {
      throw new Error('branch upstream down');
    };
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });

    const res = await request(app)
      .post(`/api/chat/branch-threads/${createRes.body.data.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '解释一下' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(res.body.error.message).toContain('辅助追问生成失败');
  });

  it('创建支线时拒绝其他会话的来源消息', async () => {
    const other = createConversation(db, userId, { learningState: 'practicing' });
    const source = appendMessage(db, {
      conversationId: other.id,
      type: 'text',
      role: 'assistant',
      content: 'other conversation source',
    });

    const res = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('来源消息');
  });

  it('加入复盘会把支线来源批改标签写入统计且重复点击不重复计数', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);
    const attempt = createAttempt(db, {
      conversationId,
      sceneId: 'restaurant',
      stage: 2,
      questionNo: 1,
      questionType: 'sentence_translation',
      prompt: 'Translate: 我想要一杯水。',
    });
    const grading = createGrading(db, {
      attemptId: attempt.id,
      score: 55,
      isCorrect: false,
      corrections: {
        explanation: '少了量词。',
        referenceAnswer: 'I would like a glass of water.',
        tags: ['missing_word'],
      },
    });
    markGraded(db, attempt.id);
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'grade',
      content: '这里是批改解释',
    });
    appendStreamEvent(db, source.id, {
      type: 'widget-ready',
      payload: {
        widgetId: 'grading-review-source',
        patch: {
          id: 'grading-review-source',
          type: 'grading-result',
          status: 'ready',
          data: {
            attemptId: attempt.id,
            score: 55,
            isCorrect: false,
            userAnswer: 'I want one water.',
            referenceAnswer: 'I would like a glass of water.',
            explanation: '少了量词。',
            tags: ['missing_word'],
          },
          version: 1,
        },
      },
      seq: 1,
      streamId: 'branch-review',
      timestamp: 1,
    });
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });
    const threadId = createRes.body.data.id as number;

    const res = await request(app)
      .post(`/api/chat/branch-threads/${threadId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      threadId,
      sourceMessageId: source.id,
      attemptId: attempt.id,
      gradingId: grading.id,
      tags: ['missing_word'],
      createdEventsCount: 1,
      masteriesUpdatedCount: 1,
    });
    expect(
      db.prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM error_tag_events WHERE attempt_id = ?'
      ).get(attempt.id)?.c
    ).toBe(1);
    expect(
      db.prepare<[number, string], { attempts_count: number }>(
        'SELECT attempts_count FROM mastery_records WHERE user_id = ? AND tag = ?'
      ).get(userId, 'missing_word')?.attempts_count
    ).toBe(1);

    const repeat = await request(app)
      .post(`/api/chat/branch-threads/${threadId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(repeat.status).toBe(200);
    expect(repeat.body.data).toMatchObject({
      createdEventsCount: 0,
      existingEventsCount: 1,
      masteriesUpdatedCount: 0,
    });
    expect(
      db.prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM error_tag_events WHERE attempt_id = ?'
      ).get(attempt.id)?.c
    ).toBe(1);
  });

  it('普通支线来源不能加入复盘', async () => {
    const source = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'general-chat',
      content: '普通消息',
    });
    const createRes = await request(app)
      .post(`/api/chat/conversations/${conversationId}/branch-threads`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceMessageId: source.id });

    const res = await request(app)
      .post(`/api/chat/branch-threads/${createRes.body.data.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('不能加入复盘');
  });
});

describe('POST /api/chat/send', () => {
  it('SSE 会先回放持久化 stream_events,即使内存 ring buffer 已清空', async () => {
    const assistant = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'practice',
      content: '生成中',
    });
    appendStreamEvent(db, assistant.id, {
      type: 'text-chunk',
      payload: { text: 'A' },
      seq: 1,
      streamId: `stream-${assistant.id}-persisted`,
      timestamp: 1,
    });
    appendStreamEvent(db, assistant.id, {
      type: 'done',
      payload: {},
      seq: 2,
      streamId: `stream-${assistant.id}-persisted`,
      timestamp: 2,
    });

    const res = await request(app)
      .get('/api/chat/stream')
      .query({
        streamId: `stream-${assistant.id}-persisted`,
      })
      .set('Authorization', `Bearer ${token}`)
      .set('Last-Event-ID', '1');

    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"done"');
    expect(res.text).not.toContain('"seq":1');
  });

  it('SSE 会轮询数据库补回不经 streamBus 发布的新事件', async () => {
    const assistant = appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'practice',
      content: '',
    });
    const streamId = `stream-${assistant.id}-poll`;
    const server = app.listen(0);
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('无法启动测试 server');
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const resPromise = fetch(
        `${baseUrl}/api/chat/stream?streamId=${encodeURIComponent(streamId)}`,
        {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      await delay(200);
      appendStreamEvent(db, assistant.id, {
        type: 'done',
        payload: {},
        seq: 1,
        streamId,
        timestamp: Date.now(),
      });

      const res = await resPromise;
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes('"type":"done"')) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      expect(text).toContain('"type":"done"');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('SSE 不再接受 query token 认证', async () => {
    const res = await request(app)
      .get('/api/chat/stream')
      .query({
        streamId: 'stream-query-token',
        token,
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('streams/:streamId/abort 停止生成并记录 aborted run', async () => {
    skillHandlerOverrides.set('practice', async function* (ctx) {
      yield { type: 'text-chunk', payload: { text: '生成中' } };
      await new Promise<void>((resolve) => {
        ctx.signal.addEventListener(
          'abort',
          () => resolve(),
          { once: true }
        );
      });
    });

    const sendRes = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, action: { type: 'next-question' } });

    expect(sendRes.status).toBe(202);
    const streamId = sendRes.body.data.streamId as string;
    const assistantMessageId = sendRes.body.data.assistantMessageId as number;

    const abortRes = await request(app)
      .post(`/api/chat/streams/${encodeURIComponent(streamId)}/abort`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(abortRes.status).toBe(200);
    expect(abortRes.body.data).toMatchObject({ streamId, aborted: true });

    const row = db
      .prepare<[number], { stream_events: string }>(
        'SELECT stream_events FROM messages WHERE id = ?'
      )
      .get(assistantMessageId);
    const events = JSON.parse(row?.stream_events ?? '[]') as Array<{
      type: string;
      payload?: { reason?: string };
    }>;
    expect(
      events.some((e) => e.type === 'done' && e.payload?.reason === 'aborted')
    ).toBe(true);
    const run = db
      .prepare<[number], { status: string; error_type: string | null }>(
        'SELECT status, error_type FROM agent_runs WHERE message_id = ?'
      )
      .get(assistantMessageId);
    expect(run).toMatchObject({ status: 'aborted', error_type: 'AbortError' });
  });

  it('停止不存在的 stream 返回 404', async () => {
    const res = await request(app)
      .post('/api/chat/streams/not-running/abort')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('没有可停止');
  });

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

  it('practicing 中太难会先降低画像等级再走场景选择,不会误作答案', async () => {
    ensureProfile(db, userId);
    upsertProfile(db, userId, { name: 'Test', level: 'B1' });
    seedAttempt();

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '太难了,简单一点' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'scene-select',
      params: {
        action: { type: 'request-new-scenes' },
        difficultyFeedback: {
          direction: 'down',
          previousLevel: 'B1',
          nextLevel: 'A2',
          changed: true,
        },
      },
    });
    expect(getProfile(db, userId)?.level).toBe('A2');
    expect(decideCalls).toHaveLength(0);
    const user = getMessages(db, conversationId).find((m) => m.role === 'user');
    expect(user?.content).toBe('太难了,简单一点');
  });

  it('太简单会提高画像等级并让下一批候选按新难度生成', async () => {
    ensureProfile(db, userId);
    upsertProfile(db, userId, { name: 'Test', level: 'B1' });
    updateLearningState(db, conversationId, 'scene_selecting', 'scene-select');

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '太简单了,来点 harder 的' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'scene-select',
      params: {
        difficultyFeedback: {
          direction: 'up',
          previousLevel: 'B1',
          nextLevel: 'B2',
          changed: true,
        },
      },
    });
    expect(getProfile(db, userId)?.level).toBe('B2');
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
    expect(res.body.data.conversationId).not.toBe(conversationId);
    expect(res.body.data.archivedConversationId).toBe(conversationId);
    expect(getConversation(db, conversationId, userId)).toMatchObject({
      status: 'archived',
      learningState: 'archived',
    });
    expect(
      getConversation(db, res.body.data.conversationId, userId)
    ).toMatchObject({
      status: 'active',
      learningState: 'scene_selecting',
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('reviewing 中换场景会归档当前复盘会话并新建下一轮', async () => {
    updateLearningState(db, conversationId, 'reviewing', 'review');
    appendMessage(db, {
      conversationId,
      type: 'text',
      role: 'assistant',
      skillName: 'review',
      content: '本轮复盘',
    });

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '换场景' });

    expect(res.status).toBe(202);
    expect(res.body.data.conversationId).not.toBe(conversationId);
    expect(res.body.data.archivedConversationId).toBe(conversationId);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'scene-select',
      params: { action: { type: 'request-new-scenes' } },
    });
    expect(getMessages(db, conversationId).map((m) => m.content)).toEqual([
      '本轮复盘',
    ]);
    expect(
      getMessages(db, res.body.data.conversationId).map((m) => m.content)
    ).toEqual(['换场景', null]);
  });

  it('awaiting_next 中复盘直接走 review,不绕 AI Router', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '复盘' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'review',
      params: { source: 'deterministic-text' },
    });
    expect(decideCalls).toHaveLength(0);
    const user = getMessages(db, conversationId).find((m) => m.role === 'user');
    expect(user?.content).toBe('复盘');
  });

  it('reviewing 中重练薄弱点直接走 retry,不绕 AI Router', async () => {
    updateLearningState(db, conversationId, 'reviewing', 'review');

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '重练 missing_word' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'retry',
      params: { targetTag: 'missing_word' },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('archived 会话只允许复盘,继续练习被拒且不创建消息', async () => {
    archiveConversation(db, conversationId);
    const beforeCount = getMessages(db, conversationId).length;

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '继续练习' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(res.body.error.message).toContain('已归档');
    expect(getMessages(db, conversationId)).toHaveLength(beforeCount);
    expect(decideCalls).toHaveLength(0);
  });

  it('archived 会话中复盘直接走 review', async () => {
    archiveConversation(db, conversationId);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '复盘' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'review',
      params: { source: 'deterministic-text' },
    });
    expect(decideCalls).toHaveLength(0);
    const user = getMessages(db, conversationId).find((m) => m.role === 'user');
    expect(user?.content).toBe('复盘');
  });

  it('practicing 中为什么类追问直接走 explain,不误提交为答案', async () => {
    seedAttempt();

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '为什么这里错了' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'explain',
      params: { source: 'deterministic-text' },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('activeSkill=retry 时 next-question 继续走 retry', async () => {
    updateLearningState(db, conversationId, 'practicing', 'retry');

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, action: { type: 'next-question' } });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'retry',
      params: { action: { type: 'next-question' } },
    });
    expect(decideCalls).toHaveLength(0);
  });

  it('非锁定态 AI Router 低置信度时改走 intent-confirm', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);
    routerDecisionOverride = {
      skillName: 'review',
      params: {},
      confidence: 0.3,
      rationale: 'ambiguous',
    };

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '看一下之前的' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'general-chat',
      params: {
        intentConfirm: {
          prompt: '看一下之前的',
          choices: expect.arrayContaining([
            expect.objectContaining({ id: 'review', action: 'text:复盘' }),
          ]),
        },
      },
    });
    expect(decideCalls).toEqual([{ userText: '看一下之前的' }]);
  });

  it('非锁定态 general-chat 决策会携带用户原文', async () => {
    updateLearningState(db, conversationId, 'awaiting_next', null);
    routerDecisionOverride = {
      skillName: 'general-chat',
      params: { topic: 'smalltalk' },
      confidence: 0.9,
      rationale: 'free chat',
    };

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '今天想聊点轻松的' });

    expect(res.status).toBe(202);
    expect(res.body.data.decision).toMatchObject({
      skillName: 'general-chat',
      params: {
        topic: 'smalltalk',
        userText: '今天想聊点轻松的',
      },
    });
    expect(decideCalls).toEqual([{ userText: '今天想聊点轻松的' }]);
  });

  it('practicing 中 AI Router 不能降级到 general-chat', async () => {
    routerDecisionOverride = {
      skillName: 'general-chat',
      params: {},
      confidence: 0.4,
      rationale: 'low confidence fallback',
    };

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId, text: '随便聊聊' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(res.body.error.message).toContain('不能降级到闲聊');
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

  it('响应与错误响应会携带 traceId', async () => {
    const res = await request(app)
      .get('/api/chat/conversations/999999/scene-dialogue')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', 'trace-test-001');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('trace-test-001');
    expect(res.body.error.details?.traceId).toBe('trace-test-001');
  });

  it('agent_runs payload 会记录 traceId、finalSeq 与 textLength', async () => {
    skillHandlerOverrides.set('practice', async function* () {
      yield { type: 'text-chunk', payload: { text: 'hello ' } };
      yield { type: 'text-chunk', payload: { text: 'world' } };
      yield { type: 'done', payload: {} };
    });

    const res = await request(app)
      .post('/api/chat/send')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', 'trace-test-002')
      .send({ conversationId, action: { type: 'next-question' } });

    expect(res.status).toBe(202);
    const run = db
      .prepare<
        [number],
        { payload: string | null; status: string; latency_ms: number | null }
      >('SELECT payload, status, latency_ms FROM agent_runs WHERE message_id = ?')
      .get(res.body.data.assistantMessageId);

    expect(run?.status).toBe('done');
    const payload = JSON.parse(run?.payload ?? '{}') as {
      traceId?: string;
      finalSeq?: number;
      textLength?: number;
    };
    expect(payload.traceId).toBe('trace-test-002');
    expect(payload.finalSeq).toBeGreaterThanOrEqual(3);
    expect(payload.textLength).toBe(11);
    expect(run?.latency_ms).not.toBeNull();
  });

  it('可从 archived 会话派生新会话并复制最近场景', async () => {
    createSceneDialogue(db, {
      userId,
      conversationId,
      sceneId: 'ticket-office',
      title: '售票窗口',
      difficulty: 'A1',
      roles: ['Customer', 'Clerk'],
      turns: [
        {
          role: 'Customer',
          en: 'Hello. I would like a ticket.',
          zh: '你好。我想买一张票。',
        },
      ],
    });
    archiveConversation(db, conversationId);

    const res = await request(app)
      .post(`/api/chat/conversations/${conversationId}/derive`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      sourceConversationId: conversationId,
      sceneCopied: true,
      sceneTitle: '售票窗口',
      conversation: {
        status: 'active',
        learningState: 'scene_selecting',
        title: '售票窗口 · 再练',
      },
    });
    const newConversationId = res.body.data.conversation.id as number;
    expect(newConversationId).not.toBe(conversationId);
    expect(getActiveSceneDialogue(db, newConversationId)).toMatchObject({
      sceneId: 'ticket-office',
      title: '售票窗口',
    });
  });

  it('非 archived 会话不能作为模板派生', async () => {
    const res = await request(app)
      .post(`/api/chat/conversations/${conversationId}/derive`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
