/**
 * retry skill 单测
 *
 *   - 无 active scene → error
 *   - 无薄弱点 → 友好提示且不出空题卡
 *   - 有 targetTag → 生成 stage=5 降难 exercise-card
 *   - 3 题已生成后 → 完成重练并转 reviewing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { retrySkill } from '../skills/retry.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider } from '../ai/types.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import { createAttempt } from '../services/exerciseAttempt.js';
import type { SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

const provider: AIProvider = {
  name: 'retry-test',
  async route() {
    throw new Error('not used');
  },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-retry-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('retry@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  const conv = createConversation(db, userId, { learningState: 'reviewing' });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'retry',
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

function makeCtx(params: Record<string, unknown> = {}): ServerSkillContext {
  return {
    user: { id: userId, email: 'retry@test.com' },
    conversationId,
    messageId,
    streamId: 'retry-stream',
    params,
    learningState: 'reviewing',
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
  params: Record<string, unknown> = {}
): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of retrySkill.handler(makeCtx(params))) out.push(ev);
  return out;
}

function seedScene(): void {
  createSceneDialogue(db, {
    userId,
    conversationId,
    sceneId: 'restaurant',
    title: '餐厅点餐',
    difficulty: 'A1',
    roles: ['Customer', 'Server'],
    turns: [
      { role: 'Server', en: 'Hello.', zh: '你好。' },
      { role: 'Customer', en: 'I would like coffee.', zh: '我想要咖啡。' },
    ],
  });
}

describe('retry skill', () => {
  it('无 active scene → error', async () => {
    const events = await collect({ targetTag: 'missing_word' });
    const err = events.find((e) => e.type === 'error') as {
      payload: { code: string };
    };
    expect(err.payload.code).toBe('NO_ACTIVE_SCENE');
  });

  it('无薄弱点 → 友好提示且不出空题卡', async () => {
    seedScene();
    const events = await collect();
    expect(events.find((e) => e.type === 'widget-init')).toBeUndefined();
    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '还没有明显薄弱点'
          )
      )
    ).toBeDefined();
  });

  it('有 targetTag → 生成 stage=5 降难 exercise-card', async () => {
    seedScene();
    const events = await collect({ targetTag: 'missing_word' });
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: {
        patch: {
          data: {
            attemptId: number;
            stage: number;
            questionNo: number;
            questionType: string;
            contextEn: string;
          };
        };
      };
    };
    expect(ready.payload.patch.data.stage).toBe(5);
    expect(ready.payload.patch.data.questionNo).toBe(1);
    expect(ready.payload.patch.data.questionType).toBe('fill_word');
    expect(ready.payload.patch.data.contextEn).toContain('______');
    const attempt = db
      .prepare<[number], { stage: number; prompt: string }>(
        'SELECT stage, prompt FROM exercise_attempts WHERE id = ?'
      )
      .get(ready.payload.patch.data.attemptId);
    expect(attempt?.stage).toBe(5);
    expect(attempt?.prompt).toContain('referenceAnswer');
  });

  it('3 题已生成后 → 完成重练并转 reviewing', async () => {
    seedScene();
    for (let q = 1; q <= 3; q++) {
      createAttempt(db, {
        conversationId,
        sceneId: 'restaurant',
        stage: 5,
        questionNo: q,
        questionType: 'fill_word',
        prompt: 'retry',
      });
    }
    const events = await collect({ targetTag: 'missing_word' });
    expect(events.find((e) => e.type === 'widget-ready')).toBeUndefined();
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition.payload.nextLearningState).toBe('reviewing');
  });
});
