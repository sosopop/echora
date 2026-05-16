/**
 * grade skill 单测
 *
 *   - 无 action → error GRADE_NO_ANSWER
 *   - attempt 不存在 → error ATTEMPT_NOT_FOUND
 *   - 正确答案(LLM 返 score=90)→ grading_results 落库 + 阶段未完保持 practicing
 *   - 错误答案 → retry_count=1,保持 practicing,无 transition
 *   - retry_count=2 后再错 → markNeedsReview
 *   - 阶段 2 最后一题正确 → state-transition('awaiting_next')
 *   - 已 needs_review 的 attempt 再 submit → error ATTEMPT_LOCKED
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { gradeSkill } from '../skills/grade.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider, ChatRequest, ChatStreamEvent } from '../ai/types.js';
import { ensureProfile, upsertProfile } from '../services/profile.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import {
  createAttempt,
  getAttempt,
  markNeedsReview,
} from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import type { SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-grade-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('g@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  ensureProfile(db, userId);
  upsertProfile(db, userId, { name: '乙', level: 'B1' });
  const conv = createConversation(db, userId, { learningState: 'practicing' });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId, type: 'text', role: 'assistant', skillName: 'grade',
  });
  messageId = msg.id;
  // 必须先有 scene_dialogue 给 grade 当上下文(可空,但 attempt sceneId 引用)
  createSceneDialogue(db, {
    userId, conversationId,
    sceneId: 'test', title: '测试',
    difficulty: 'B1',
    roles: ['A', 'B'],
    turns: [
      { role: 'A', en: 'Hi', zh: '你好' },
      { role: 'B', en: 'Hello', zh: '哈喽' },
    ],
  });
});

afterEach(() => {
  closeDb(db);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

function makeProvider(gradeReturn: {
  score: number; is_correct: boolean; reference_answer: string;
  explanation: string; tags: string[];
}): AIProvider {
  return {
    name: 'mock-grade',
    async route() { throw new Error('not used'); },
    async *chat(_req: ChatRequest): AsyncIterable<ChatStreamEvent> {
      yield { type: 'tool-use', toolName: 'grade_answer', input: gradeReturn };
      yield { type: 'message-stop', stopReason: 'tool_use' };
    },
  };
}

function makeCtx(
  provider: AIProvider,
  action?: unknown
): ServerSkillContext {
  return {
    user: { id: userId, email: 'g@test.com' },
    conversationId, messageId,
    streamId: 'test', params: action ? { action } : {},
    learningState: 'practicing',
    signal: new AbortController().signal,
    provider, db,
    emit() {},
    makeWidgetId(p) { return `${p}-test`; },
  };
}

async function collect(ctx: ServerSkillContext): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of gradeSkill.handler(ctx)) out.push(ev);
  return out;
}

function seedAttempt(stage: number, questionNo: number): number {
  const a = createAttempt(db, {
    conversationId, sceneId: 'test',
    stage, questionNo, questionType: 'fill_word', prompt: 'x',
  });
  return a.id;
}

describe('grade skill', () => {
  it('无 action → error GRADE_NO_ANSWER', async () => {
    const ctx = makeCtx(makeProvider({
      score: 0, is_correct: false, reference_answer: '', explanation: '', tags: [],
    }));
    const events = await collect(ctx);
    const err = events.find((e) => e.type === 'error') as { payload: { code: string } };
    expect(err.payload.code).toBe('GRADE_NO_ANSWER');
  });

  it('attempt 不存在 → error ATTEMPT_NOT_FOUND', async () => {
    const provider = makeProvider({
      score: 100, is_correct: true, reference_answer: 'x', explanation: 'ok', tags: [],
    });
    const events = await collect(
      makeCtx(provider, { type: 'submit-answer', payload: { attemptId: 9999, answer: 'x' } })
    );
    const err = events.find((e) => e.type === 'error') as { payload: { code: string } };
    expect(err.payload.code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('正确答案 → 落库 + 阶段未完保持 practicing', async () => {
    const attemptId = seedAttempt(1, 1);
    const provider = makeProvider({
      score: 90, is_correct: true, reference_answer: 'order',
      explanation: '不错', tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer', payload: { attemptId, answer: 'order' },
      })
    );
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: { patch: { data: { score: number; isCorrect: boolean } } };
    };
    expect(ready.payload.patch.data.score).toBe(90);
    expect(ready.payload.patch.data.isCorrect).toBe(true);
    // 阶段未完(只通过 1/2),无 state-transition
    expect(events.find((e) => e.type === 'state-transition')).toBeUndefined();
    expect(getAttempt(db, attemptId)?.status).toBe('graded');
  });

  it('错误答案 → retry_count=1, 保持 practicing', async () => {
    const attemptId = seedAttempt(1, 1);
    const provider = makeProvider({
      score: 30, is_correct: false, reference_answer: 'order',
      explanation: '动词原形', tags: ['collocation'],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer', payload: { attemptId, answer: 'ordering' },
      })
    );
    expect(events.find((e) => e.type === 'state-transition')).toBeUndefined();
    expect(getAttempt(db, attemptId)?.retryCount).toBe(1);
  });

  it('阶段 2 最后一题正确 → state-transition awaiting_next', async () => {
    // 阶段 1 已 2 题全过(在 DB seed 中)
    for (let q = 1; q <= 2; q++) {
      const a = createAttempt(db, {
        conversationId, sceneId: 'test',
        stage: 1, questionNo: q, questionType: 'fill_word', prompt: 'x',
      });
      createGrading(db, { attemptId: a.id, score: 100, isCorrect: true, corrections: {} });
    }
    // 阶段 2 第 1 题已过
    const s2q1 = createAttempt(db, {
      conversationId, sceneId: 'test',
      stage: 2, questionNo: 1, questionType: 'sentence_translation', prompt: 'x',
    });
    createGrading(db, { attemptId: s2q1.id, score: 90, isCorrect: true, corrections: {} });
    // 现在提交阶段 2 第 2 题正确
    const s2q2 = createAttempt(db, {
      conversationId, sceneId: 'test',
      stage: 2, questionNo: 2, questionType: 'sentence_translation', prompt: 'x',
    });
    const provider = makeProvider({
      score: 100, is_correct: true, reference_answer: 'Hello.',
      explanation: '完美', tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer', payload: { attemptId: s2q2.id, answer: 'Hello.' },
      })
    );
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition).toBeDefined();
    expect(transition.payload.nextLearningState).toBe('awaiting_next');
  });

  it('阶段完成统计只计算当前 sceneId', async () => {
    for (let stage = 1; stage <= 2; stage++) {
      for (let q = 1; q <= 2; q++) {
        const a = createAttempt(db, {
          conversationId,
          sceneId: 'old-scene',
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
    createSceneDialogue(db, {
      userId,
      conversationId,
      sceneId: 'new-scene',
      title: '新场景',
      difficulty: 'B1',
      roles: ['A', 'B'],
      turns: [
        { role: 'A', en: 'Thanks.', zh: '谢谢。' },
        { role: 'B', en: 'You are welcome.', zh: '不客气。' },
      ],
    });
    const attemptId = createAttempt(db, {
      conversationId,
      sceneId: 'new-scene',
      stage: 1,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: 'x',
    }).id;
    const provider = makeProvider({
      score: 100,
      is_correct: true,
      reference_answer: 'Thanks.',
      explanation: '正确',
      tags: [],
    });

    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'Thanks.' },
      })
    );

    expect(events.find((e) => e.type === 'state-transition')).toBeUndefined();
  });

  it('已 needs_review 的 attempt 再 submit → error ATTEMPT_LOCKED', async () => {
    const attemptId = seedAttempt(1, 1);
    markNeedsReview(db, attemptId);
    const provider = makeProvider({
      score: 100, is_correct: true, reference_answer: 'x', explanation: 'ok', tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer', payload: { attemptId, answer: 'x' },
      })
    );
    const err = events.find((e) => e.type === 'error') as { payload: { code: string } };
    expect(err.payload.code).toBe('ATTEMPT_LOCKED');
  });
});
