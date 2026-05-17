/**
 * review skill 单测
 *
 *   - 无批改记录 → 友好提示且不渲染空 progress-summary
 *   - 有四阶段批改记录 → 生成真实 progress-summary
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { reviewSkill } from '../skills/review.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider } from '../ai/types.js';
import { createConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import { createSceneDialogue } from '../services/sceneDialogue.js';
import { createAttempt, markGraded } from '../services/exerciseAttempt.js';
import { createGrading, type GradingResultDTO } from '../services/gradingResult.js';
import { recordGradingLearningSignals } from '../services/learningSignals.js';
import type { SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

const provider: AIProvider = {
  name: 'review-test',
  async route() {
    throw new Error('not used');
  },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-review-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('review@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  const conv = createConversation(db, userId, { learningState: 'awaiting_next' });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'review',
  });
  messageId = msg.id;
  createSceneDialogue(db, {
    userId,
    conversationId,
    sceneId: 'restaurant',
    title: '餐厅点餐',
    difficulty: 'A1',
    roles: ['Customer', 'Server'],
    turns: [
      { role: 'Server', en: 'Hello.', zh: '你好。' },
      { role: 'Customer', en: 'I would like water.', zh: '我想要水。' },
    ],
  });
});

afterEach(() => {
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 文件锁,忽略 */
  }
});

function makeCtx(): ServerSkillContext {
  return {
    user: { id: userId, email: 'review@test.com' },
    conversationId,
    messageId,
    streamId: 'review-stream',
    params: {},
    learningState: 'awaiting_next',
    signal: new AbortController().signal,
    provider,
    db,
    emit() {},
    makeWidgetId(p) {
      return `${p}-test`;
    },
  };
}

async function collect(): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of reviewSkill.handler(makeCtx())) out.push(ev);
  return out;
}

function seedGradedAttempt(input: {
  stage: number;
  questionNo: number;
  questionType: string;
  score: number;
  isCorrect: boolean;
  tags: string[];
}): GradingResultDTO {
  const attempt = createAttempt(db, {
    conversationId,
    sceneId: 'restaurant',
    stage: input.stage,
    questionNo: input.questionNo,
    questionType: input.questionType,
    prompt: `阶段 ${input.stage} 第 ${input.questionNo} 题`,
  });
  const grading = createGrading(db, {
    attemptId: attempt.id,
    score: input.score,
    isCorrect: input.isCorrect,
    corrections: {
      referenceAnswer: 'I would like water.',
      explanation: '测试解释',
      tags: input.tags,
    },
  });
  recordGradingLearningSignals(db, { userId, attempt, grading });
  markGraded(db, attempt.id);
  return grading;
}

describe('review skill', () => {
  it('无批改记录 → 友好提示且不显示空 widget', async () => {
    const events = await collect();
    expect(
      events.find(
        (e) =>
          e.type === 'text-chunk' &&
          (e as { payload: { text: string } }).payload.text.includes(
            '还没有可复盘'
          )
      )
    ).toBeDefined();
    expect(events.find((e) => e.type === 'widget-init')).toBeUndefined();
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition.payload.nextLearningState).toBe('reviewing');
  });

  it('有四阶段批改记录 → 生成真实 progress-summary', async () => {
    const types = [
      'fill_word',
      'fill_word',
      'sentence_translation',
      'sentence_translation',
      'dialogue_chain',
      'dialogue_chain',
      'role_reversal',
      'role_reversal',
    ];
    types.forEach((questionType, i) => {
      const stage = Math.floor(i / 2) + 1;
      const questionNo = (i % 2) + 1;
      seedGradedAttempt({
        stage,
        questionNo,
        questionType,
        score: i === 3 ? 55 : 90,
        isCorrect: i !== 3,
        tags: i === 3 ? ['missing_word'] : [],
      });
    });

    const events = await collect();
    const init = events.find((e) => e.type === 'widget-init') as {
      payload: { widget: { type: string; status: string } };
    };
    expect(init.payload.widget.type).toBe('progress-summary');
    expect(init.payload.widget.status).toBe('loading');
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: {
        patch: {
          data: {
            title: string;
            sceneName: string;
            questionsCount: number;
            averageScore: number;
            categoryCounts: {
              exact: number;
              similar: number;
              incorrect: number;
            };
            weakTagsCount: number;
            weakPoints: string[];
            masteries: Array<{ tag: string; score: number }>;
          };
        };
      };
    };
    expect(ready.payload.patch.data.sceneName).toBe('餐厅点餐');
    expect(ready.payload.patch.data.questionsCount).toBe(8);
    expect(ready.payload.patch.data.averageScore).toBe(86);
    expect(ready.payload.patch.data.categoryCounts).toEqual({
      exact: 0,
      similar: 7,
      incorrect: 1,
    });
    expect(ready.payload.patch.data.weakTagsCount).toBe(1);
    expect(ready.payload.patch.data.weakPoints.join(' ')).toContain('missing_word');
    expect(
      ready.payload.patch.data.masteries.some((m) => m.tag === 'missing_word')
    ).toBe(true);
    const text = events
      .filter((e) => e.type === 'text-chunk')
      .map((e) => (e as { payload: { text: string } }).payload.text)
      .join('');
    expect(text).toContain('完全正确 0 题');
    expect(text).toContain('还不错 7 题');
    expect(text).toContain('错误 1 题');
    expect(text).not.toContain('平均');
    const answerReady = events
      .filter((e) => e.type === 'widget-ready')
      .find(
        (e) =>
          (e as { payload: { patch: { data?: { title?: string } } } }).payload
            .patch.data?.title === '餐厅点餐 · 8 道题回看'
      ) as {
      payload: {
        patch: {
          data: {
            items: Array<{
              questionNo: number;
              promptShort: string;
              score: number;
              status: string;
              tags: string[];
            }>;
          };
        };
      };
    };
    expect(answerReady.payload.patch.data.items).toHaveLength(8);
    expect(answerReady.payload.patch.data.items[3]).toMatchObject({
      questionNo: 4,
      score: 55,
      status: 'bad',
      tags: ['missing_word'],
    });
  });
});
