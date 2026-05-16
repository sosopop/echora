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
    async *chat(_req: ChatRequest): AsyncIterable<ChatStreamEvent> {
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

async function collect(skill: typeof onboardingSkill, ctx: ServerSkillContext) {
  const out: SkillEventInput[] = [];
  for await (const ev of skill.handler(ctx)) {
    out.push(ev);
  }
  return out;
}

describe('onboarding skill', () => {
  it('text-delta 转 text-chunk;tool-use 触发画像落库 + state-transition', async () => {
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
    expect(textChunks.length).toBe(2);

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

  it('已采集齐时跳过 LLM 调用,直接转场', async () => {
    // 预先把 profile 写齐
    db.prepare(
      `UPDATE user_profiles SET name = ?, level = ? WHERE user_id = ?`
    ).run('已知用户', 'B2', userId);
    const provider: AIProvider = {
      name: 'should-not-call',
      async route() {
        throw new Error('should not call route');
      },
      async *chat(): AsyncIterable<ChatStreamEvent> {
        throw new Error('should not call chat');
      },
    };
    const events = await collect(onboardingSkill, makeCtx(provider));
    const transitions = events.filter((e) => e.type === 'state-transition');
    expect(transitions.length).toBe(1);
  });
});
