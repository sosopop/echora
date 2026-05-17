/**
 * 学习闭环 4 个 service 单测
 *
 *   - sceneDialogue:create + getActive(最新一条)
 *   - sceneHistory:append 自动 prune max 10 + list
 *   - exerciseAttempt:create / markSubmitted / markGraded / incrementRetry / countStagePassed / maxQuestionNo
 *   - gradingResult:create + getByAttempt + corrections JSON 往返
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import {
  createConversation,
  getConversation,
  updateLearningState,
} from '../services/conversation.js';
import { createSceneDialogue, getActiveSceneDialogue } from '../services/sceneDialogue.js';
import {
  appendSceneHistory,
  listSceneHistory,
  SCENE_HISTORY_MAX,
} from '../services/sceneHistory.js';
import {
  createAttempt,
  getAttempt,
  findLatestAttempt,
  markSubmitted,
  markGraded,
  incrementRetry,
  markNeedsReview,
  countStagePassed,
  maxQuestionNo,
} from '../services/exerciseAttempt.js';
import {
  createGrading,
  getGradingByAttempt,
} from '../services/gradingResult.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-svc-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('svc@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  const conv = createConversation(db, userId, { learningState: 'practicing' });
  conversationId = conv.id;
});

afterEach(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows lock */
  }
});

describe('sceneDialogue service', () => {
  it('create + getActive 返回最新一条', () => {
    const d1 = createSceneDialogue(db, {
      userId,
      conversationId,
      sceneId: 'restaurant',
      title: '餐厅点餐',
      difficulty: 'B1',
      roles: ['Customer', 'Waiter'],
      turns: [
        { role: 'Waiter', en: 'Hello.', zh: '你好。' },
        { role: 'Customer', en: 'Hi.', zh: '嗨。' },
      ],
    });
    expect(d1.id).toBeGreaterThan(0);
    expect(d1.title).toBe('餐厅点餐');
    expect(d1.turns).toHaveLength(2);
    expect(d1.roles).toEqual(['Customer', 'Waiter']);
    const got = getActiveSceneDialogue(db, conversationId);
    expect(got?.id).toBe(d1.id);
  });

  it('多次 create 时 getActive 返回最新', () => {
    createSceneDialogue(db, {
      userId, conversationId, sceneId: 'a', title: 'A',
      difficulty: 'A2', roles: [], turns: [],
    });
    const d2 = createSceneDialogue(db, {
      userId, conversationId, sceneId: 'b', title: 'B',
      difficulty: 'B2', roles: [], turns: [],
    });
    expect(getActiveSceneDialogue(db, conversationId)?.id).toBe(d2.id);
  });
});

describe('conversation service lock policy', () => {
  it('practicing / grading 会话默认 locked,解锁态恢复 open', () => {
    expect(getConversation(db, conversationId, userId)?.lockPolicy).toBe(
      'locked'
    );

    updateLearningState(db, conversationId, 'grading', 'grade');
    expect(getConversation(db, conversationId, userId)?.lockPolicy).toBe(
      'locked'
    );

    updateLearningState(db, conversationId, 'awaiting_next', null);
    expect(getConversation(db, conversationId, userId)?.lockPolicy).toBe(
      'open'
    );

    updateLearningState(db, conversationId, 'reviewing', 'review');
    expect(getConversation(db, conversationId, userId)?.lockPolicy).toBe(
      'open'
    );
  });
});

describe('sceneHistory service', () => {
  it('append + list 返回最新优先', () => {
    appendSceneHistory(db, userId, 'school');
    appendSceneHistory(db, userId, 'restaurant');
    const list = listSceneHistory(db, userId);
    expect(list).toEqual(['restaurant', 'school']);
  });

  it('累计超 max 自动 prune 最旧', () => {
    // 插 max + 3 = 13 条
    for (let i = 1; i <= SCENE_HISTORY_MAX + 3; i++) {
      appendSceneHistory(db, userId, `scene-${i}`);
    }
    const list = listSceneHistory(db, userId);
    expect(list).toHaveLength(SCENE_HISTORY_MAX);
    // 最新优先,最旧 3 条(scene-1/2/3)应已被删
    expect(list[0]).toBe('scene-13');
    expect(list).not.toContain('scene-1');
    expect(list).not.toContain('scene-2');
    expect(list).not.toContain('scene-3');
  });
});

describe('exerciseAttempt service', () => {
  it('create + getAttempt 返回 DTO', () => {
    const a = createAttempt(db, {
      conversationId,
      sceneId: 'restaurant',
      stage: 1,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: 'I would ___ a steak.',
    });
    expect(a.status).toBe('pending');
    expect(a.retryCount).toBe(0);
    expect(a.stage).toBe(1);
    expect(getAttempt(db, a.id)?.id).toBe(a.id);
  });

  it('markSubmitted / markGraded 状态迁移', () => {
    const a = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    markSubmitted(db, a.id, 'order');
    expect(getAttempt(db, a.id)?.status).toBe('submitted');
    expect(getAttempt(db, a.id)?.userAnswer).toBe('order');
    markGraded(db, a.id);
    expect(getAttempt(db, a.id)?.status).toBe('graded');
  });

  it('incrementRetry 返回新值,markNeedsReview 改 status', () => {
    const a = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    expect(incrementRetry(db, a.id)).toBe(1);
    expect(incrementRetry(db, a.id)).toBe(2);
    markNeedsReview(db, a.id);
    expect(getAttempt(db, a.id)?.status).toBe('needs_review');
  });

  it('countStagePassed 仅统计 graded + is_correct=1', () => {
    const a1 = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    const a2 = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 2,
      questionType: 'fill_word', prompt: 'y',
    });
    createGrading(db, { attemptId: a1.id, score: 90, isCorrect: true, corrections: {} });
    createGrading(db, { attemptId: a2.id, score: 30, isCorrect: false, corrections: {} });
    expect(countStagePassed(db, conversationId, 1)).toBe(1);
    expect(countStagePassed(db, conversationId, 2)).toBe(0);
  });

  it('maxQuestionNo 返回当前阶段最大 q_no', () => {
    createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 5,
      questionType: 'fill_word', prompt: 'y',
    });
    expect(maxQuestionNo(db, conversationId, 1)).toBe(5);
    expect(maxQuestionNo(db, conversationId, 2)).toBe(0);
  });

  it('findLatestAttempt 返回最新一条', () => {
    createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    const a2 = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 2,
      questionType: 'fill_word', prompt: 'y',
    });
    expect(findLatestAttempt(db, conversationId)?.id).toBe(a2.id);
  });
});

describe('gradingResult service', () => {
  it('create + getByAttempt + corrections JSON 往返', () => {
    const a = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    const g = createGrading(db, {
      attemptId: a.id,
      score: 85,
      isCorrect: true,
      corrections: {
        referenceAnswer: 'order',
        explanation: '动词原形',
        tags: ['collocation'],
      },
    });
    expect(g.score).toBe(85);
    expect(g.isCorrect).toBe(true);
    expect(g.corrections.referenceAnswer).toBe('order');
    expect(g.corrections.tags).toEqual(['collocation']);

    const got = getGradingByAttempt(db, a.id);
    expect(got?.id).toBe(g.id);
    expect(got?.corrections.explanation).toBe('动词原形');
  });

  it('attempt_id 重复 → UPSERT 覆盖原 grading(不抛错)', () => {
    const a = createAttempt(db, {
      conversationId, sceneId: 's', stage: 1, questionNo: 1,
      questionType: 'fill_word', prompt: 'x',
    });
    const g1 = createGrading(db, { attemptId: a.id, score: 50, isCorrect: false, corrections: { explanation: 'first' } });
    const g2 = createGrading(db, { attemptId: a.id, score: 80, isCorrect: true, corrections: { explanation: 'second' } });
    // 同一 attempt_id,id 应保持不变(UPDATE 不改 id)
    expect(g2.id).toBe(g1.id);
    expect(g2.score).toBe(80);
    expect(g2.isCorrect).toBe(true);
    expect(g2.corrections.explanation).toBe('second');
    // 表中只有 1 行
    const count = db.prepare<[number], { c: number }>(
      'SELECT COUNT(*) AS c FROM grading_results WHERE attempt_id = ?'
    ).get(a.id);
    expect(count?.c).toBe(1);
  });
});
