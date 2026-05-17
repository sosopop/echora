/**
 * explain skill 单测
 *
 *   - 有最近批改 → 输出 follow-up-source + 基于真实答案/参考/标签解释
 *   - 当前题未批改 → 只给提示,不泄露参考答案
 *   - 无题目 → 友好提示且不渲染空 widget
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { explainSkill } from '../skills/explain.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider } from '../ai/types.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import { createAttempt, markGraded } from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import type { SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

const provider: AIProvider = {
  name: 'explain-test',
  async route() {
    throw new Error('not used');
  },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-explain-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('explain@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  const conv = createConversation(db, userId, { learningState: 'reviewing' });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'explain',
  });
  messageId = msg.id;
});

afterEach(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

function makeCtx(learningState: ServerSkillContext['learningState'] = 'reviewing'): ServerSkillContext {
  return {
    user: { id: userId, email: 'explain@test.com' },
    conversationId,
    messageId,
    streamId: 'explain-stream',
    params: {},
    learningState,
    signal: new AbortController().signal,
    provider,
    db,
    emit() {},
    makeWidgetId(p) {
      return `${p}-test`;
    },
  };
}

async function collect(
  learningState: ServerSkillContext['learningState'] = 'reviewing'
): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of explainSkill.handler(makeCtx(learningState))) {
    out.push(ev);
  }
  return out;
}

describe('explain skill', () => {
  it('有最近批改时输出来源 widget 与真实错因解释', async () => {
    const attempt = createAttempt(db, {
      conversationId,
      sceneId: 'restaurant',
      stage: 2,
      questionNo: 1,
      questionType: 'sentence_translation',
      prompt: 'Translate: 我想要一杯水。',
    });
    db.prepare('UPDATE exercise_attempts SET user_answer = ? WHERE id = ?').run(
      'I want one water.',
      attempt.id
    );
    createGrading(db, {
      attemptId: attempt.id,
      score: 55,
      isCorrect: false,
      corrections: {
        referenceAnswer: 'I would like a glass of water.',
        explanation: '请求语气不够自然,量词也需要补齐。',
        tags: ['politeness', 'missing_word'],
      },
    });
    markGraded(db, attempt.id);

    const events = await collect();
    const text = events
      .filter((ev) => ev.type === 'text-chunk')
      .map((ev) => ev.payload.text)
      .join('');
    const ready = events.find((ev) => ev.type === 'widget-ready');

    expect(ready?.payload.patch).toMatchObject({
      status: 'ready',
      data: {
        sourceKind: 'grading',
        sourceLabel: '来自:最近一次批改 · 55 分',
      },
    });
    expect(text).toContain('I want one water.');
    expect(text).toContain('I would like a glass of water.');
    expect(text).toContain('politeness / missing_word');
    expect(text).toContain('请求别人帮忙时');
  });

  it('未提交/未批改题只给提示,不泄露标准答案', async () => {
    createAttempt(db, {
      conversationId,
      sceneId: 'restaurant',
      stage: 1,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: 'Fill the blank: I would ______ a coffee.',
    });

    const events = await collect('practicing');
    const text = events
      .filter((ev) => ev.type === 'text-chunk')
      .map((ev) => ev.payload.text)
      .join('');
    const ready = events.find((ev) => ev.type === 'widget-ready');

    expect(ready?.payload.patch).toMatchObject({
      status: 'ready',
      data: {
        sourceKind: 'exercise',
        sourceLabel: '来自:当前题目',
        canMarkForReview: false,
      },
    });
    expect(text).toContain('不直接给标准答案');
    expect(text).toContain('空格处需要什么词性');
    expect(text).not.toContain('like');
  });

  it('无题目时返回友好提示且不初始化空 widget', async () => {
    const events = await collect();

    expect(events.some((ev) => ev.type === 'widget-init')).toBe(false);
    expect(
      events
        .filter((ev) => ev.type === 'text-chunk')
        .map((ev) => ev.payload.text)
        .join('')
    ).toContain('还没有找到可解释的题目或批改记录');
  });
});
