/**
 * practice skill 单测
 *
 *   - 无 scene_dialogue → error NO_ACTIVE_SCENE
 *   - 阶段 1 第 1 题 → widget exercise-card + mode-switch(fill) + 落 attempt(stage=1)
 *   - 阶段 1 已通过 2 题 → 进阶段 2(mode-switch chat)
 *   - 未通过/重复题不把 question_no 推到模板之外
 *   - 新场景不继承旧场景已通过进度
 *   - 阶段 2 已通过 2 题 → 进阶段 3(dialogue_chain)
 *   - 阶段 3 已通过 2 题 → 进阶段 4(role_reversal)
 *   - 阶段 4 已通过 2 题 → state-transition('awaiting_next')
 *   - dialogue.turns 不足 → error NO_QUESTION_TEMPLATE
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { practiceSkill } from '../skills/practice.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider } from '../ai/types.js';
import { ensureProfile, upsertProfile } from '../services/profile.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import { createAttempt, markNeedsReview } from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import type { SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-prac-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('p@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  ensureProfile(db, userId);
  upsertProfile(db, userId, { name: '甲', level: 'B1' });
  const conv = createConversation(db, userId, { learningState: 'scene_selecting' });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId, type: 'text', role: 'assistant', skillName: 'practice',
  });
  messageId = msg.id;
});

afterEach(() => {
  closeDb(db);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* lock */ }
});

const provider: AIProvider = {
  name: 'noop',
  async route() { throw new Error('not used'); },
};

function makeCtx(): ServerSkillContext {
  return {
    user: { id: userId, email: 'p@test.com' },
    conversationId, messageId,
    streamId: 'test', params: {},
    learningState: 'practicing',
    signal: new AbortController().signal,
    provider, db,
    emit() {},
    makeWidgetId(prefix) { return `${prefix}-test`; },
  };
}

async function collect(): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of practiceSkill.handler(makeCtx())) out.push(ev);
  return out;
}

function seedDialogue(turnCount: number): void {
  const turns = Array.from({ length: turnCount }, (_, i) => ({
    role: i % 2 === 0 ? 'Customer' : 'Waiter',
    en: `Sentence number ${i + 1} please.`,
    zh: `第 ${i + 1} 句话,请。`,
  }));
  createSceneDialogue(db, {
    userId, conversationId,
    sceneId: 'test-scene', title: '测试场景',
    difficulty: 'B1',
    roles: ['Customer', 'Waiter'],
    turns,
  });
}

function seedPassed(stage: number, questionCount = 2): void {
  for (let q = 1; q <= questionCount; q++) {
    const a = createAttempt(db, {
      conversationId,
      sceneId: 'test-scene',
      stage,
      questionNo: q,
      questionType: 'x',
      prompt: 'x',
    });
    createGrading(db, {
      attemptId: a.id,
      score: 100,
      isCorrect: true,
      corrections: {},
    });
  }
}

describe('practice skill', () => {
  it('无 scene_dialogue → error NO_ACTIVE_SCENE', async () => {
    const events = await collect();
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect((err as { payload: { code: string } }).payload.code).toBe(
      'NO_ACTIVE_SCENE'
    );
  });

  it('阶段 1 第 1 题:fill 模式 + exercise-card + attempt 落库', async () => {
    seedDialogue(6);
    const events = await collect();
    const mode = events.find((e) => e.type === 'mode-switch') as {
      payload: { mode: string };
    };
    expect(mode.payload.mode).toBe('fill');

    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: {
        patch: {
          data: {
            attemptId: number;
            stage: number;
            totalStages: number;
            stageGoal: number;
            questionType: string;
          };
        };
      };
    };
    expect(ready.payload.patch.data.stage).toBe(1);
    expect(ready.payload.patch.data.totalStages).toBe(4);
    expect(ready.payload.patch.data.stageGoal).toBe(2);
    expect(ready.payload.patch.data.questionType).toBe('fill_word');
    expect(ready.payload.patch.data.attemptId).toBeGreaterThan(0);

    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition.payload.nextLearningState).toBe('practicing');
  });

  it('阶段 1 已通过 2 题 → 进阶段 2(chat 模式)', async () => {
    seedDialogue(6);
    // 模拟阶段 1 已 graded 2 题且全对
    for (let i = 1; i <= 2; i++) {
      const a = createAttempt(db, {
        conversationId, sceneId: 'test-scene',
        stage: 1, questionNo: i, questionType: 'fill_word', prompt: 'x',
      });
      createGrading(db, { attemptId: a.id, score: 100, isCorrect: true, corrections: {} });
    }
    const events = await collect();
    const mode = events.find((e) => e.type === 'mode-switch') as {
      payload: { mode: string };
    };
    expect(mode.payload.mode).toBe('chat');
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: { patch: { data: { stage: number; questionType: string } } };
    };
    expect(ready.payload.patch.data.stage).toBe(2);
    expect(ready.payload.patch.data.questionType).toBe('sentence_translation');
  });

  it('未通过/重复题不把 question_no 推到模板之外', async () => {
    seedDialogue(4);
    // 阶段 1 已完成,进入阶段 2
    for (let q = 1; q <= 2; q++) {
      const a = createAttempt(db, {
        conversationId, sceneId: 'test-scene',
        stage: 1, questionNo: q, questionType: 'fill_word', prompt: 'x',
      });
      createGrading(db, {
        attemptId: a.id,
        score: 100,
        isCorrect: true,
        corrections: {},
      });
    }
    // 旧版本可能留下很多阶段 2 未通过 attempt;下一题应仍补第 1 个未通过目标。
    for (let q = 1; q <= 6; q++) {
      const a = createAttempt(db, {
        conversationId, sceneId: 'test-scene',
        stage: 2, questionNo: q, questionType: 'sentence_translation', prompt: 'x',
      });
      createGrading(db, {
        attemptId: a.id,
        score: 40,
        isCorrect: false,
        corrections: {},
      });
    }

    const events = await collect();
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: { patch: { data: { stage: number; questionNo: number } } };
    };
    expect(ready.payload.patch.data.stage).toBe(2);
    expect(ready.payload.patch.data.questionNo).toBe(1);
  });

  it('needs_review 题算已处理 → 继续同阶段下一题', async () => {
    seedDialogue(6);
    const a = createAttempt(db, {
      conversationId,
      sceneId: 'test-scene',
      stage: 1,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: 'x',
    });
    createGrading(db, {
      attemptId: a.id,
      score: 20,
      isCorrect: false,
      corrections: {},
    });
    markNeedsReview(db, a.id);

    const events = await collect();
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: { patch: { data: { stage: number; questionNo: number } } };
    };
    expect(ready.payload.patch.data.stage).toBe(1);
    expect(ready.payload.patch.data.questionNo).toBe(2);
  });

  it('新场景不继承旧场景已通过进度', async () => {
    seedDialogue(4);
    for (let stage = 1; stage <= 4; stage++) seedPassed(stage);
    createSceneDialogue(db, {
      userId,
      conversationId,
      sceneId: 'new-scene',
      title: '新场景',
      difficulty: 'B1',
      roles: ['A', 'B'],
      turns: [
        { role: 'A', en: 'Good morning.', zh: '早上好。' },
        { role: 'B', en: 'How are you?', zh: '你好吗？' },
        { role: 'A', en: 'I need a ticket.', zh: '我需要一张票。' },
        { role: 'B', en: 'Here you are.', zh: '给你。' },
      ],
    });

    const events = await collect();
    expect(events.find((e) => e.type === 'state-transition' && (
      e as { payload: { nextLearningState?: string } }
    ).payload.nextLearningState === 'awaiting_next')).toBeUndefined();
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: { patch: { data: { stage: number; questionNo: number } } };
    };
    expect(ready.payload.patch.data.stage).toBe(1);
    expect(ready.payload.patch.data.questionNo).toBe(1);
  });

  it('阶段 2 已通过 2 题 → 进阶段 3 对话接龙', async () => {
    seedDialogue(8);
    seedPassed(1);
    seedPassed(2);
    const events = await collect();
    const mode = events.find((e) => e.type === 'mode-switch') as {
      payload: { mode: string };
    };
    expect(mode.payload.mode).toBe('chat');
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: {
        patch: {
          data: { stage: number; questionType: string; targetZh?: string };
        };
      };
    };
    expect(ready.payload.patch.data.stage).toBe(3);
    expect(ready.payload.patch.data.questionType).toBe('dialogue_chain');
    expect(ready.payload.patch.data.targetZh).toBeTruthy();
    expect(events.find((e) => e.type === 'state-transition' && (
      e as { payload: { nextLearningState?: string } }
    ).payload.nextLearningState === 'awaiting_next')).toBeUndefined();
  });

  it('阶段 3 已通过 2 题 → 进阶段 4 角色互换', async () => {
    seedDialogue(8);
    seedPassed(1);
    seedPassed(2);
    seedPassed(3);
    const events = await collect();
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: {
        patch: {
          data: { stage: number; questionType: string; targetZh?: string; contextEn?: string };
        };
      };
    };
    expect(ready.payload.patch.data.stage).toBe(4);
    expect(ready.payload.patch.data.questionType).toBe('role_reversal');
    expect(ready.payload.patch.data.targetZh).toBeTruthy();
    expect(ready.payload.patch.data.contextEn).toBeUndefined();
  });

  it('阶段 4 已通过 2 题 → state-transition awaiting_next', async () => {
    seedDialogue(8);
    for (let stage = 1; stage <= 4; stage++) seedPassed(stage);
    const events = await collect();
    expect(events.find((e) => e.type === 'widget-init')).toBeUndefined();
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition.payload.nextLearningState).toBe('awaiting_next');
  });

  it('dialogue.turns 不足以出当前阶段题 → error NO_QUESTION_TEMPLATE', async () => {
    seedDialogue(1); // 仅 1 句,阶段 1 第 1 题能出,但第 2 题不能
    // 标阶段 1 第 1 题通过(让 next 推进到阶段 1 第 2 题)
    const a = createAttempt(db, {
      conversationId, sceneId: 'test-scene',
      stage: 1, questionNo: 1, questionType: 'fill_word', prompt: 'x',
    });
    createGrading(db, { attemptId: a.id, score: 100, isCorrect: true, corrections: {} });
    const events = await collect();
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect((err as { payload: { code: string } }).payload.code).toBe(
      'NO_QUESTION_TEMPLATE'
    );
  });
});
