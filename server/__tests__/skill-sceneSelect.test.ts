/**
 * scene-select skill 单测(mock provider)
 *
 *   - 无 action(默认展示候选)→ propose + selectTopK → widget-ready + 候选数据
 *   - action=request-new-scenes → 同上 + 过滤已用
 *   - action=select-scene → runDialogueGeneration → 落 scene_dialogues + scene_history + 自动出第一题
 *   - propose 失败 → widget error + mode-switch(chat) + yield error
 *   - dialogue 生成失败 → yield error
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb, type Db } from '../db/connect.js';
import { migrate } from '../db/migrate.js';
import { sceneSelectSkill } from '../skills/sceneSelect.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider, ChatRequest, ChatStreamEvent } from '../ai/types.js';
import { ensureProfile, upsertProfile } from '../services/profile.js';
import { createConversation, getConversation } from '../services/conversation.js';
import { appendMessage } from '../services/message.js';
import {
  listSceneHistory,
  appendSceneHistory,
} from '../services/sceneHistory.js';
import { getActiveSceneDialogue } from '../services/sceneDialogue.js';
import type { LearningState, SkillEventInput } from '../../shared/skill.js';

let db: Db;
let tmpDir: string;
let userId: number;
let conversationId: number;
let messageId: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-scene-'));
  db = connect(path.join(tmpDir, 'test.db'));
  migrate(db);
  const u = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run('scene@test.com', 'x');
  userId = Number(u.lastInsertRowid);
  ensureProfile(db, userId);
  upsertProfile(db, userId, { name: '张三', level: 'B1' });
  const conv = createConversation(db, userId, {
    learningState: 'scene_selecting',
  });
  conversationId = conv.id;
  const msg = appendMessage(db, {
    conversationId,
    type: 'text',
    role: 'assistant',
    skillName: 'scene-select',
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

function makeProvider(opts: {
  proposeScenes?: unknown[];
  dialogue?: { roles: string[]; turns: { role: string; en: string; zh: string }[] };
  proposeShouldThrow?: boolean;
  dialogueShouldThrow?: boolean;
}): AIProvider {
  return {
    name: 'mock',
    async route() { throw new Error('not used'); },
    async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
      const toolName = req.tools?.[0]?.name;
      if (toolName === 'propose_scenes') {
        if (opts.proposeShouldThrow) throw new Error('propose upstream 503');
        yield {
          type: 'tool-use',
          toolName: 'propose_scenes',
          input: { scenes: opts.proposeScenes ?? [] },
        };
      } else if (toolName === 'generate_scene_dialogue') {
        if (opts.dialogueShouldThrow) throw new Error('dialogue upstream 503');
        yield {
          type: 'tool-use',
          toolName: 'generate_scene_dialogue',
          input: opts.dialogue ?? { roles: [], turns: [] },
        };
      }
      yield { type: 'message-stop', stopReason: 'tool_use' };
    },
  };
}

function makeCtx(
  provider: AIProvider,
  action?: unknown,
  learningState: LearningState = 'scene_selecting'
): ServerSkillContext {
  return {
    user: { id: userId, email: 'scene@test.com' },
    conversationId,
    messageId,
    streamId: 'test-stream',
    params: action ? { action } : {},
    learningState,
    signal: new AbortController().signal,
    provider,
    db,
    emit() {},
    makeWidgetId(prefix) { return `${prefix}-test`; },
  };
}

async function collect(ctx: ServerSkillContext): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of sceneSelectSkill.handler(ctx)) {
    out.push(ev);
  }
  return out;
}

const MOCK_SCENES = [
  { id: 'restaurant', topic: 'restaurant ordering', title: '餐厅点餐', description: '点单/结账', knowledgePoint: '固定搭配', difficulty: 'B1' },
  { id: 'travel', topic: 'travel asking', title: '旅行问路', description: '问方向', knowledgePoint: '介词', difficulty: 'B1' },
  { id: 'school', topic: 'school chat', title: '校园对话', description: '同学之间', knowledgePoint: '礼貌请求', difficulty: 'B1' },
  { id: 'job', topic: 'job interview', title: '工作面试', description: '面试问答', knowledgePoint: '过去时', difficulty: 'B2' },
  { id: 'shop', topic: 'shopping basics', title: '商场购物', description: '挑选/砍价', knowledgePoint: '比较级', difficulty: 'A2' },
];

describe('sceneSelect skill', () => {
  it('无 action(默认)→ widget scene-cards + ready', async () => {
    const provider = makeProvider({ proposeScenes: MOCK_SCENES });
    const events = await collect(makeCtx(provider));

    const init = events.find((e) => e.type === 'widget-init');
    expect(init).toBeDefined();
    const ready = events.find((e) => e.type === 'widget-ready');
    expect(ready).toBeDefined();
    const cards = (ready as { payload: { patch: { data: { cards: unknown[] } } } })
      .payload.patch.data.cards;
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);

    const mode = events.find((e) => e.type === 'mode-switch');
    expect((mode as { payload: { mode: string } }).payload.mode).toBe('select');
    expect(events.find((e) => e.type === 'done')).toBeDefined();
  });

  it('action=request-new-scenes → 候选过滤已用主题', async () => {
    // 预先标 restaurant 已用
    appendSceneHistory(db, userId, 'restaurant ordering');
    const provider = makeProvider({ proposeScenes: MOCK_SCENES });
    const events = await collect(
      makeCtx(provider, { type: 'request-new-scenes' })
    );

    const ready = events.find((e) => e.type === 'widget-ready');
    const cards = (ready as { payload: { patch: { data: { cards: { id: string }[] } } } })
      .payload.patch.data.cards;
    expect(cards.find((c) => c.id === 'restaurant')).toBeUndefined();
  });

  it('practicing 中 request-new-scenes 会切回 scene_selecting 再展示候选', async () => {
    const provider = makeProvider({ proposeScenes: MOCK_SCENES });
    const events = await collect(
      makeCtx(provider, { type: 'request-new-scenes' }, 'practicing')
    );

    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string; activeSkill: string | null };
    };
    expect(transition.payload.nextLearningState).toBe('scene_selecting');
    expect(transition.payload.activeSkill).toBe('scene-select');
    expect(events.find((e) => e.type === 'widget-ready')).toBeDefined();
  });

  it('action=select-scene → 生成 dialogue + scene_history + 自动出第一题', async () => {
    const provider = makeProvider({
      dialogue: {
        roles: ['Customer', 'Waiter'],
        turns: [
          { role: 'Waiter', en: 'Hello.', zh: '你好。' },
          { role: 'Customer', en: 'Hi, a table for two please.', zh: '你好,两人桌。' },
          { role: 'Waiter', en: 'Right this way.', zh: '这边请。' },
          { role: 'Customer', en: 'Thanks.', zh: '谢谢。' },
        ],
      },
    });
    const events = await collect(
      makeCtx(provider, {
        type: 'select-scene',
        payload: { sceneId: 'restaurant-ordering' },
      })
    );

    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string; activeSkill: string | null };
    };
    expect(transition.payload.nextLearningState).toBe('practicing');
    expect(transition.payload.activeSkill).toBe('practice');
    const mode = events.find((e) => e.type === 'mode-switch') as {
      payload: { mode: string };
    };
    expect(mode.payload.mode).toBe('fill');
    const exerciseReady = events.find(
      (e) =>
        e.type === 'widget-ready' &&
        (e as { payload: { widgetId: string } }).payload.widgetId.includes(
          'exercise-card'
        )
    ) as {
      payload: { patch: { data: { attemptId: number; stage: number } } };
    };
    expect(exerciseReady.payload.patch.data.attemptId).toBeGreaterThan(0);
    expect(exerciseReady.payload.patch.data.stage).toBe(1);

    // scene_dialogue 已落库
    const dialogue = getActiveSceneDialogue(db, conversationId);
    expect(dialogue).not.toBeNull();
    expect(dialogue!.turns).toHaveLength(4);
    expect(dialogue!.sceneId).toBe('restaurant-ordering');

    // scene_history 已记录
    const history = listSceneHistory(db, userId);
    expect(history).toContain('restaurant ordering');
    expect(getConversation(db, conversationId, userId)?.title).toBe(
      'Restaurant Ordering'
    );
  });

  it('propose 失败 → widget error + mode-switch(chat) + yield error', async () => {
    const provider = makeProvider({ proposeShouldThrow: true });
    const events = await collect(makeCtx(provider));
    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect((errors[0] as { payload: { code: string } }).payload.code).toBe(
      'SCENE_PROPOSE_FAILED'
    );
    const ready = events.find((e) => e.type === 'widget-ready') as {
      payload: { patch: { status: string; data: { errorCode: string } } };
    };
    expect(ready.payload.patch.status).toBe('error');
    expect(ready.payload.patch.data.errorCode).toBe('SCENE_PROPOSE_FAILED');
    const modes = events.filter((e) => e.type === 'mode-switch') as Array<{
      payload: { mode: string };
    }>;
    expect(modes[modes.length - 1].payload.mode).toBe('chat');
  });

  it('dialogue 生成失败 → yield error,无 state-transition', async () => {
    const provider = makeProvider({ dialogueShouldThrow: true });
    const events = await collect(
      makeCtx(provider, {
        type: 'select-scene',
        payload: { sceneId: 'restaurant' },
      })
    );
    expect(events.find((e) => e.type === 'error')).toBeDefined();
    expect(events.find((e) => e.type === 'state-transition')).toBeUndefined();
    expect(getActiveSceneDialogue(db, conversationId)).toBeNull();
  });
});
