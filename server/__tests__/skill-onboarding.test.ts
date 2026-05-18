/**
 * onboarding Skill 单测
 *
 * 注入 mock provider,断言:
 *   - text-delta → text-chunk
 *   - tool-use(update_profile) → 落库 + state-transition
 *   - 必填字段不全时 → 不产 state-transition
 *   - signal abort 后中断
 *   - provider.chat 不存在 → error
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { onboardingSkill } from '../skills/onboarding.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider, ChatRequest, ChatStreamEvent } from '../ai/types.js';
import { ensureProfile, getProfile } from '../services/profile.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import type { SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-onb-'));
  const dbPath = path.join(tmpDir, 'test.db');
  db = connect(dbPath);
  migrate(db);
  // 建 user + profile + conversation + assistant message
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('test@onb.com', 'x');
  userId = Number(u.lastInsertRowid);
  ensureProfile(db, userId);
  const conv = createConversation(db, userId, { learningState: 'onboarding' });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'onboarding',
  });
  messageId = msg.id;
});

afterEach(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows lock */
  }
});

function makeProvider(events: ChatStreamEvent[]): AIProvider {
  return {
    name: 'mock',
    async route() {
      throw new Error('not used');
    },
    async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
      const toolName = req.tools?.[0]?.name;
      if (toolName === 'propose_scenes') {
        yield {
          type: 'tool-use',
          toolName: 'propose_scenes',
          input: {
            scenes: [
              {
                id: 'cafe-order',
                topic: 'cafe order',
                title: '咖啡点单',
                description: '练习点饮品和打包',
                knowledgePoint: '礼貌请求',
                difficulty: 'B1',
              },
              {
                id: 'school-chat',
                topic: 'school chat',
                title: '校园对话',
                description: '练习同学间交流',
                knowledgePoint: '一般疑问句',
                difficulty: 'B1',
              },
              {
                id: 'travel-help',
                topic: 'travel help',
                title: '旅行问路',
                description: '练习问路和确认方向',
                knowledgePoint: '介词',
                difficulty: 'B1',
              },
            ],
          },
        };
        yield { type: 'message-stop', stopReason: 'tool_use' };
        return;
      }
      for (const ev of events) yield ev;
    },
  };
}

function makeCtx(provider: AIProvider, signal?: AbortSignal): ServerSkillContext {
  return {
    user: { id: userId, email: 'test@onb.com' },
    conversationId,
    messageId,
    streamId: 'test-stream',
    params: {},
    learningState: 'onboarding',
    signal: signal ?? new AbortController().signal,
    provider,
    db,
    emit() {},
    makeWidgetId(prefix) {
      return `${prefix}-test`;
    },
  };
}

function makeCtxWithParams(
  provider: AIProvider,
  params: Record<string, unknown>,
  signal?: AbortSignal
): ServerSkillContext {
  return {
    ...makeCtx(provider, signal),
    params,
  };
}

async function collect(skill: typeof onboardingSkill, ctx: ServerSkillContext) {
  const out: SkillEventInput[] = [];
  for await (const ev of skill.handler(ctx)) {
    out.push(ev);
  }
  return out;
}

describe('onboarding skill', () => {
  it('text-delta 转 text-chunk;tool-use 触发画像落库 + state-transition + 场景推荐', async () => {
    const provider = makeProvider([
      { type: 'text-delta', text: '你好,我是 Echo!' },
      { type: 'text-delta', text: '怎么称呼你?' },
      {
        type: 'tool-use',
        toolName: 'update_profile',
        input: { name: '小李', level: 'B1', grade: '高二' },
      },
      { type: 'message-stop', stopReason: 'end_turn' },
    ]);
    const events = await collect(onboardingSkill, makeCtx(provider));

    const textChunks = events.filter((e) => e.type === 'text-chunk');
    expect(textChunks.length).toBeGreaterThanOrEqual(3);
    const text = textChunks
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');
    expect(text).toContain('你好,我是 Echo!');
    expect(text).toContain('推荐几个适合练习的场景');

    const transitions = events.filter((e) => e.type === 'state-transition');
    expect(transitions.length).toBe(1);
    expect(
      (transitions[0] as { payload: { nextLearningState: string } }).payload
        .nextLearningState
    ).toBe('scene_selecting');

    const profile = getProfile(db, userId);
    expect(profile?.name).toBe('小李');
    expect(profile?.level).toBe('B1');
    expect(profile?.grade).toBe('高二');

    const widgetReady = events.find((e) => e.type === 'widget-ready');
    expect(widgetReady).toBeDefined();
    expect(
      (widgetReady as { payload: { patch: { data: { cards: unknown[] } } } })
        .payload.patch.data.cards.length
    ).toBeGreaterThan(0);

    const dones = events.filter((e) => e.type === 'done');
    expect(dones.length).toBe(1);
  });

  it('必填字段不全时不产 state-transition', async () => {
    const provider = makeProvider([
      { type: 'text-delta', text: '怎么称呼你?' },
      // 只给 name,缺 level
      {
        type: 'tool-use',
        toolName: 'update_profile',
        input: { name: '小李' },
      },
      { type: 'message-stop', stopReason: 'end_turn' },
    ]);
    const events = await collect(onboardingSkill, makeCtx(provider));
    const transitions = events.filter((e) => e.type === 'state-transition');
    expect(transitions.length).toBe(0);
    // name 已落库
    expect(getProfile(db, userId)?.name).toBe('小李');
    expect(getProfile(db, userId)?.level).toBeNull();
    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');
    expect(text).toContain('英语水平');
  });

  it('provider 不调工具时仍追加下一步确定性引导', async () => {
    const provider = makeProvider([
      { type: 'text-delta', text: '你想聊点什么?' },
      { type: 'message-stop', stopReason: 'end_turn' },
    ]);

    const events = await collect(onboardingSkill, makeCtx(provider));
    const transitions = events.filter((e) => e.type === 'state-transition');
    expect(transitions.length).toBe(0);
    expect(getProfile(db, userId)?.name).toBeNull();

    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');
    expect(text).toContain('你想聊点什么?');
    expect(text).toContain('怎么称呼');
  });

  it('用户明确拒绝昵称时用临时称呼继续推进英语水平', async () => {
    const provider = makeProvider([
      { type: 'text-delta', text: '那我们先不聊名字啦。你的英语水平大概在哪个阶段?' },
      { type: 'message-stop', stopReason: 'end_turn' },
    ]);

    const events = await collect(
      onboardingSkill,
      makeCtxWithParams(provider, { userText: '不告诉你可以吗' })
    );
    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');

    expect(getProfile(db, userId)?.name).toBe('小伙伴');
    expect(getProfile(db, userId)?.level).toBeNull();
    expect(text).toContain('英语水平');
    expect(text).not.toContain('接下来先告诉我怎么称呼你');
  });

  it('provider 已经问英语水平时不重复追加 level 兜底', async () => {
    db.prepare(
      `UPDATE user_profiles SET name = ? WHERE user_id = ?`
    ).run('小伙伴', userId);
    const provider = makeProvider([
      { type: 'text-delta', text: '那直接说说你的英语水平吧,比如 A1/B1 或四级左右。' },
      { type: 'message-stop', stopReason: 'end_turn' },
    ]);

    const events = await collect(onboardingSkill, makeCtx(provider));
    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');

    expect(text).toBe('那直接说说你的英语水平吧,比如 A1/B1 或四级左右。');
  });

  it('用户拒绝或要求 AI 决定英语水平时必须重问,不兜底猜测', async () => {
    db.prepare(
      `UPDATE user_profiles SET name = ? WHERE user_id = ?`
    ).run('小伙伴', userId);
    let chatCalled = false;
    const provider: AIProvider = {
      name: 'should-not-call',
      async route() {
        throw new Error('not used');
      },
      async *chat(): AsyncIterable<ChatStreamEvent> {
        chatCalled = true;
        yield { type: 'text-delta', text: '不应该调用模型' };
      },
    };

    const events = await collect(
      onboardingSkill,
      makeCtxWithParams(provider, { userText: '你决定吧,都可以' })
    );
    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');

    expect(chatCalled).toBe(false);
    expect(getProfile(db, userId)?.level).toBeNull();
    expect(text).toContain('必须确认');
    expect(text).toContain('A1/A2/B1/B2/C1/C2');
    expect(events.filter((e) => e.type === 'state-transition')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
  });

  it('provider.chat 不存在时 yield error', async () => {
    const provider: AIProvider = {
      name: 'no-chat',
      async route() {
        throw new Error('not used');
      },
    };
    const events = await collect(onboardingSkill, makeCtx(provider));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe('error');
  });

  it('stub provider uses deterministic onboarding prompt instead of smalltalk', async () => {
    const provider: AIProvider = {
      name: 'stub',
      async route() {
        throw new Error('not used');
      },
      async *chat(): AsyncIterable<ChatStreamEvent> {
        throw new Error('stub chat should not be called by onboarding');
      },
    };

    const events = await collect(onboardingSkill, makeCtx(provider));
    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');

    expect(text).toContain('Echo');
    expect(text).toContain('称呼');
    expect(text).not.toContain('复盘');
    expect(text).not.toContain('换个新场景');
  });

  it('signal abort 后立即中断', async () => {
    const ctrl = new AbortController();
    const provider: AIProvider = {
      name: 'slow',
      async route() {
        throw new Error('not used');
      },
      async *chat(): AsyncIterable<ChatStreamEvent> {
        yield { type: 'text-delta', text: 'first' };
        ctrl.abort();
        yield { type: 'text-delta', text: 'second' };
      },
    };
    const events = await collect(onboardingSkill, makeCtx(provider, ctrl.signal));
    const textChunks = events.filter((e) => e.type === 'text-chunk');
    expect(textChunks.length).toBe(1);
    expect((textChunks[0] as { payload: { text: string } }).payload.text).toBe(
      'first'
    );
  });

  it('已采集齐时跳过 onboarding LLM 调用,直接转场并推荐场景', async () => {
    // 预先把 profile 写齐
    db.prepare(
      `UPDATE user_profiles SET name = ?, level = ? WHERE user_id = ?`
    ).run('已知用户', 'B2', userId);
    const chatTools: string[] = [];
    const provider: AIProvider = {
      name: 'should-not-call',
      async route() {
        throw new Error('should not call route');
      },
      async *chat(req): AsyncIterable<ChatStreamEvent> {
        const toolName = req.tools?.[0]?.name ?? 'none';
        chatTools.push(toolName);
        if (toolName === 'update_profile') {
          throw new Error('should not call onboarding chat');
        }
        yield {
          type: 'tool-use',
          toolName: 'propose_scenes',
          input: {
            scenes: [
              {
                id: 'meeting',
                topic: 'meeting',
                title: '会议讨论',
                description: '练习表达观点',
                knowledgePoint: '观点表达',
                difficulty: 'B2',
              },
              {
                id: 'travel',
                topic: 'travel',
                title: '旅行计划',
                description: '练习安排路线',
                knowledgePoint: '将来时',
                difficulty: 'B2',
              },
              {
                id: 'shopping',
                topic: 'shopping',
                title: '商场购物',
                description: '练习比较选择',
                knowledgePoint: '比较级',
                difficulty: 'B1',
              },
            ],
          },
        };
        yield { type: 'message-stop', stopReason: 'tool_use' };
      },
    };
    const events = await collect(onboardingSkill, makeCtx(provider));
    const transitions = events.filter((e) => e.type === 'state-transition');
    expect(transitions.length).toBe(1);
    expect(chatTools).toEqual(['propose_scenes']);
    expect(events.find((e) => e.type === 'widget-ready')).toBeDefined();
  });
});
