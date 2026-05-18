/**
 * grade skill 单测
 *
 *   - 无 action → error GRADE_NO_ANSWER
 *   - attempt 不存在 → error ATTEMPT_NOT_FOUND
 *   - 正确答案(LLM 返 score=90)→ grading_results 落库 + 阶段未完保持 practicing
 *   - 错误答案 → retry_count=1,保持 practicing,无 transition
 *   - retry_count=2 后再错 → markNeedsReview
 *   - 阶段 2 最后一题正确 → 保持 practicing,等待阶段 3
 *   - 阶段 4 最后一题正确 → state-transition('awaiting_next')
 *   - 阶段 4 答错 → retry_count=1,保持 practicing
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
  incrementRetry,
  markNeedsReview,
} from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import { getMasteryRecord } from '../services/masteryRecord.js';
import {
  decodeAttemptPrompt,
  encodeRetryAttemptPrompt,
} from '../services/attemptPrompt.js';
import type { SkillEventInput } from '../../shared/skill.js';
import type { CefrLevel } from '../../shared/api.js';

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
  explanation: string; tags: string[]; category?: string;
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

function seedPassedAttempt(stage: number, questionNo: number): number {
  const attempt = createAttempt(db, {
    conversationId,
    sceneId: 'test',
    stage,
    questionNo,
    questionType: 'x',
    prompt: 'x',
  });
  createGrading(db, {
    attemptId: attempt.id,
    score: 100,
    isCorrect: true,
    corrections: {},
  });
  return attempt.id;
}

function seedActiveDialogue(
  difficulty: CefrLevel,
  turnCount: number
): void {
  createSceneDialogue(db, {
    userId,
    conversationId,
    sceneId: 'test',
    title: `${difficulty} 测试`,
    difficulty,
    roles: ['A', 'B'],
    turns: Array.from({ length: turnCount }, (_, index) => ({
      role: index % 2 === 0 ? 'A' : 'B',
      en: `Sentence ${index + 1}.`,
      zh: `第 ${index + 1} 句。`,
    })),
  });
}

function widgetReadyData<T>(
  events: SkillEventInput[],
  widgetType: string
): T {
  const ready = events.find(
    (e) =>
      e.type === 'widget-ready' &&
      (e as { payload: { patch: { data?: { stage?: number } } } }).payload
        .patch.data !== undefined &&
      events.some(
        (candidate) =>
          candidate.type === 'widget-init' &&
          (candidate as { payload: { widget: { type: string; id: string } } })
            .payload.widget.type === widgetType &&
          (candidate as { payload: { widget: { id: string } } }).payload
            .widget.id ===
            (e as { payload: { widgetId: string } }).payload.widgetId
      )
  ) as { payload: { patch: { data: T } } } | undefined;
  if (!ready) throw new Error(`missing widget-ready for ${widgetType}`);
  return ready.payload.patch.data;
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

  it('完全正确 → 落库 + 自动进入下一题', async () => {
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
    const grading = widgetReadyData<{
      category: string;
      isCorrect: boolean;
    }>(events, 'grading-result');
    expect(grading.category).toBe('exact');
    expect(grading.isCorrect).toBe(true);
    const nextExercise = widgetReadyData<{
      stage: number;
      questionNo: number;
    }>(events, 'exercise-card');
    expect(nextExercise.stage).toBe(1);
    expect(nextExercise.questionNo).toBe(2);
    expect(getAttempt(db, attemptId)?.status).toBe('graded');
  });

  it('意思相近 → 标记 similar 并自动进入下一题', async () => {
    const attemptId = seedAttempt(1, 1);
    const provider = makeProvider({
      score: 86,
      is_correct: true,
      category: 'similar',
      reference_answer: 'order',
      explanation: '意思接近',
      tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'buy' },
      })
    );
    const grading = widgetReadyData<{
      category: string;
      isCorrect: boolean;
    }>(events, 'grading-result');
    expect(grading.category).toBe('similar');
    expect(grading.isCorrect).toBe(true);
    expect(widgetReadyData<{ questionNo: number }>(events, 'exercise-card').questionNo).toBe(2);
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
    const grading = widgetReadyData<{ category: string; isCorrect: boolean }>(
      events,
      'grading-result'
    );
    expect(grading.category).toBe('incorrect');
    expect(grading.isCorrect).toBe(false);
    expect(events.find((e) => e.type === 'state-transition')).toBeUndefined();
    expect(getAttempt(db, attemptId)?.retryCount).toBe(1);
  });

  it('错误答案带 tags → 写入 error_tag_events 并更新 mastery_records', async () => {
    const attemptId = seedAttempt(1, 1);
    const provider = makeProvider({
      score: 30,
      is_correct: false,
      reference_answer: 'order',
      explanation: '固定搭配不对',
      tags: ['collocation', 'missing_word'],
    });

    await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'ordering' },
      })
    );

    const events = db
      .prepare<
        [number],
        { tag: string; severity: string; included_in_stats: number }
      >(
        `SELECT tag, severity, included_in_stats
         FROM error_tag_events
         WHERE attempt_id = ?
         ORDER BY tag ASC`
      )
      .all(attemptId);
    expect(events).toEqual([
      { tag: 'collocation', severity: 'high', included_in_stats: 1 },
      { tag: 'missing_word', severity: 'high', included_in_stats: 1 },
    ]);
    const mastery = getMasteryRecord(db, userId, 'collocation');
    expect(mastery?.attemptsCount).toBe(1);
    expect(mastery?.correctCount).toBe(0);
    expect(mastery?.masteryScore).toBeLessThan(50);
  });

  it('主线题第 2 次错误 → 标记 needs_review 并自动生成降难替换题', async () => {
    const attemptId = seedAttempt(1, 1);
    expect(incrementRetry(db, attemptId)).toBe(1);
    const provider = makeProvider({
      score: 20,
      is_correct: false,
      reference_answer: 'to',
      explanation: '缺少 to',
      tags: ['missing_word'],
    });

    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'order' },
      })
    );

    const attempt = getAttempt(db, attemptId);
    expect(attempt?.retryCount).toBe(2);
    expect(attempt?.status).toBe('needs_review');
    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '更简单的同类题'
          )
      )
    ).toBeDefined();

    const replacement = widgetReadyData<{
      attemptId: number;
      stage: number;
      questionNo: number;
      remediationKind: string;
    }>(events, 'exercise-card');
    expect(replacement.stage).toBe(5);
    expect(replacement.questionNo).toBe(1);
    expect(replacement.remediationKind).toBe('replacement');

    const replacementAttempt = getAttempt(db, replacement.attemptId);
    const decoded = decodeAttemptPrompt(replacementAttempt?.prompt ?? '');
    expect(decoded.kind).toBe('replacement');
    expect(decoded.sourceAttemptId).toBe(attemptId);
    expect(decoded.targetTag).toBe('missing_word');
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string; activeSkill: string | null };
    };
    expect(transition.payload.nextLearningState).toBe('practicing');
    expect(transition.payload.activeSkill).toBe('practice');
  });

  it('正确答案无 tags → 不写错误事件,但更新题型掌握度', async () => {
    const attemptId = seedAttempt(1, 1);
    const provider = makeProvider({
      score: 90,
      is_correct: true,
      reference_answer: 'order',
      explanation: '正确',
      tags: [],
    });

    await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'order' },
      })
    );

    const eventCount = db
      .prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM error_tag_events WHERE attempt_id = ?'
      )
      .get(attemptId);
    expect(eventCount?.c).toBe(0);
    const mastery = getMasteryRecord(db, userId, 'fill_word');
    expect(mastery?.attemptsCount).toBe(1);
    expect(mastery?.correctCount).toBe(1);
    expect(mastery?.masteryScore).toBeGreaterThan(50);
  });

  it('阶段 2 最后一题正确 → 自动进入阶段 3,不结束整场', async () => {
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
    const transitions = events.filter((e) => e.type === 'state-transition') as Array<{
      payload: { nextLearningState: string };
    }>;
    expect(
      transitions.some((e) => e.payload.nextLearningState === 'awaiting_next')
    ).toBe(false);
    const nextExercise = widgetReadyData<{ stage: number; questionNo: number }>(
      events,
      'exercise-card'
    );
    expect(nextExercise.stage).toBe(3);
    expect(nextExercise.questionNo).toBe(1);
    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '阶段 2 完成'
          )
      )
    ).toBeDefined();
  });

  it('A1 阶段 2 第 1 题正确 → 自动进入阶段 3', async () => {
    seedActiveDialogue('A1', 5);
    for (let q = 1; q <= 2; q++) {
      seedPassedAttempt(1, q);
    }
    const s2q1 = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 2,
      questionNo: 1,
      questionType: 'sentence_translation',
      prompt: 'x',
    });
    const provider = makeProvider({
      score: 100,
      is_correct: true,
      reference_answer: 'Sentence 3.',
      explanation: '完美',
      tags: [],
    });

    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId: s2q1.id, answer: 'Sentence 3.' },
      })
    );

    expect(
      (events.filter((e) => e.type === 'state-transition') as Array<{
        payload: { nextLearningState: string };
      }>).some((e) => e.payload.nextLearningState === 'awaiting_next')
    ).toBe(false);
    const nextExercise = widgetReadyData<{
      stage: number;
      questionNo: number;
      stageGoal: number;
      totalQuestions: number;
    }>(events, 'exercise-card');
    expect(nextExercise.stage).toBe(3);
    expect(nextExercise.questionNo).toBe(1);
    expect(nextExercise.stageGoal).toBe(1);
    expect(nextExercise.totalQuestions).toBe(5);
  });

  it('C1 阶段 2 第 2 题正确 → 仍停在阶段 2 第 3 题', async () => {
    seedActiveDialogue('C1', 10);
    for (let q = 1; q <= 3; q++) {
      seedPassedAttempt(1, q);
    }
    seedPassedAttempt(2, 1);
    const s2q2 = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 2,
      questionNo: 2,
      questionType: 'sentence_translation',
      prompt: 'x',
    });
    const provider = makeProvider({
      score: 100,
      is_correct: true,
      reference_answer: 'Sentence 5.',
      explanation: '完美',
      tags: [],
    });

    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId: s2q2.id, answer: 'Sentence 5.' },
      })
    );

    const nextExercise = widgetReadyData<{
      stage: number;
      questionNo: number;
      stageGoal: number;
      totalQuestions: number;
    }>(events, 'exercise-card');
    expect(nextExercise.stage).toBe(2);
    expect(nextExercise.questionNo).toBe(3);
    expect(nextExercise.stageGoal).toBe(3);
    expect(nextExercise.totalQuestions).toBe(10);
  });

  it('阶段 4 最后一题正确 → state-transition awaiting_next', async () => {
    for (let stage = 1; stage <= 4; stage++) {
      const maxQ = stage === 4 ? 1 : 2;
      for (let q = 1; q <= maxQ; q++) {
        const a = createAttempt(db, {
          conversationId,
          sceneId: 'test',
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
    const s4q2 = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 4,
      questionNo: 2,
      questionType: 'role_reversal',
      prompt: 'x',
    });
    const provider = makeProvider({
      score: 100, is_correct: true, reference_answer: 'Hello.',
      explanation: '完美', tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer', payload: { attemptId: s4q2.id, answer: 'Hello.' },
      })
    );
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition).toBeDefined();
    expect(transition.payload.nextLearningState).toBe('awaiting_next');
    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '可能会回应'
          )
      )
    ).toBeDefined();
  });

  it('C1 阶段 4 第 2 题正确 → 10 题主线完成', async () => {
    seedActiveDialogue('C1', 10);
    for (let q = 1; q <= 3; q++) {
      seedPassedAttempt(1, q);
      seedPassedAttempt(2, q);
    }
    for (let q = 1; q <= 2; q++) {
      seedPassedAttempt(3, q);
    }
    seedPassedAttempt(4, 1);
    const s4q2 = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 4,
      questionNo: 2,
      questionType: 'role_reversal',
      prompt: 'x',
    });
    const provider = makeProvider({
      score: 100,
      is_correct: true,
      reference_answer: 'Sentence 2.',
      explanation: '完美',
      tags: [],
    });

    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId: s4q2.id, answer: 'Sentence 2.' },
      })
    );

    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition.payload.nextLearningState).toBe('awaiting_next');
    expect(
      events.find((e) => e.type === 'widget-init' && (
        e as { payload: { widget: { type: string } } }
      ).payload.widget.type === 'exercise-card')
    ).toBeUndefined();
  });

  it('阶段 4 答错 → retry_count=1, 保持 practicing', async () => {
    const attemptId = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 4,
      questionNo: 1,
      questionType: 'role_reversal',
      prompt: 'x',
    }).id;
    const provider = makeProvider({
      score: 30, is_correct: false, reference_answer: 'Hi',
      explanation: '不对', tags: ['word_order'],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer', payload: { attemptId, answer: 'wrong' },
      })
    );
    expect(events.find((e) => e.type === 'state-transition')).toBeUndefined();
    expect(getAttempt(db, attemptId)?.retryCount).toBe(1);
  });

  it('重练题答对 → 自动进入下一道重练题', async () => {
    const attemptId = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 5,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: encodeRetryAttemptPrompt({
        prompt: 'retry',
        referenceAnswer: 'to',
        targetTag: 'missing_word',
      }),
    }).id;
    const provider = makeProvider({
      score: 90,
      is_correct: true,
      reference_answer: 'to',
      explanation: '正确',
      tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'to' },
      })
    );
    const transitions = events.filter((e) => e.type === 'state-transition') as Array<{
      payload: { nextLearningState: string; activeSkill: string | null };
    }>;
    expect(
      transitions.some((e) => e.payload.nextLearningState === 'awaiting_next')
    ).toBe(false);
    expect(
      transitions.some((e) => e.payload.activeSkill === 'retry')
    ).toBe(true);
    const nextRetry = widgetReadyData<{
      stage: number;
      questionNo: number;
    }>(events, 'exercise-card');
    expect(nextRetry.stage).toBe(5);
    expect(nextRetry.questionNo).toBe(2);
    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '专项题答对'
          )
      )
    ).toBeDefined();
  });

  it('替换题答对 → 回到主线下一题', async () => {
    const sourceAttempt = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 1,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: 'x',
    });
    createGrading(db, {
      attemptId: sourceAttempt.id,
      score: 20,
      isCorrect: false,
      corrections: {},
    });
    markNeedsReview(db, sourceAttempt.id);
    const replacementId = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 5,
      questionNo: 1,
      questionType: 'fill_word',
      prompt: encodeRetryAttemptPrompt({
        prompt: 'retry',
        referenceAnswer: 'to',
        targetTag: 'missing_word',
        kind: 'replacement',
        sourceAttemptId: sourceAttempt.id,
      }),
    }).id;
    const provider = makeProvider({
      score: 90,
      is_correct: true,
      reference_answer: 'to',
      explanation: '正确',
      tags: [],
    });

    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId: replacementId, answer: 'to' },
      })
    );

    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '替换题通过了'
          )
      )
    ).toBeDefined();
    const nextMainline = widgetReadyData<{
      stage: number;
      questionNo: number;
    }>(events, 'exercise-card');
    expect(nextMainline.stage).toBe(1);
    expect(nextMainline.questionNo).toBe(2);
  });

  it('第 3 道重练题答对 → 转 reviewing', async () => {
    for (let q = 1; q <= 2; q++) {
      createAttempt(db, {
        conversationId,
        sceneId: 'test',
        stage: 5,
        questionNo: q,
        questionType: 'fill_word',
        prompt: 'retry',
      });
    }
    const attemptId = createAttempt(db, {
      conversationId,
      sceneId: 'test',
      stage: 5,
      questionNo: 3,
      questionType: 'fill_word',
      prompt: 'retry',
    }).id;
    const provider = makeProvider({
      score: 90,
      is_correct: true,
      reference_answer: 'to',
      explanation: '正确',
      tags: [],
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'submit-answer',
        payload: { attemptId, answer: 'to' },
      })
    );
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string; activeSkill: string | null };
    };
    expect(transition.payload.nextLearningState).toBe('reviewing');
    expect(transition.payload.activeSkill).toBe('review');
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

    const transitions = events.filter((e) => e.type === 'state-transition') as Array<{
      payload: { nextLearningState: string };
    }>;
    expect(
      transitions.some((e) => e.payload.nextLearningState === 'awaiting_next')
    ).toBe(false);
    const nextExercise = widgetReadyData<{
      stage: number;
      questionNo: number;
    }>(events, 'exercise-card');
    expect(nextExercise.stage).toBe(1);
    expect(nextExercise.questionNo).toBe(2);
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
