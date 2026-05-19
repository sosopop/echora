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
  toolsSeen?: string[];
}): AIProvider {
  return {
    name: 'mock',
    async route() { throw new Error('not used'); },
    async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
      const toolName = req.tools?.[0]?.name;
      if (toolName) opts.toolsSeen?.push(toolName);
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
  learningState: LearningState = 'scene_selecting',
  extraParams: Record<string, unknown> = {}
): ServerSkillContext {
  return {
    user: { id: userId, email: 'scene@test.com' },
    conversationId,
    messageId,
    streamId: 'test-stream',
    params: { ...(action ? { action } : {}), ...extraParams },
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
  { id: 'airport', topic: 'airport check-in', title: '机场值机', description: '托运行李', knowledgePoint: '旅行表达', difficulty: 'B1' },
  { id: 'doctor', topic: 'doctor visit', title: '看病问诊', description: '描述症状', knowledgePoint: '身体表达', difficulty: 'B1' },
  { id: 'movie', topic: 'movie plan', title: '看电影', description: '约朋友看电影', knowledgePoint: '邀请表达', difficulty: 'B1' },
];

describe('sceneSelect skill', () => {
  it('无 action(默认)→ widget scene-cards 返回 8 张推荐 + ready', async () => {
    const provider = makeProvider({ proposeScenes: MOCK_SCENES });
    const events = await collect(makeCtx(provider));

    const init = events.find((e) => e.type === 'widget-init');
    expect(init).toBeDefined();
    const ready = events.find((e) => e.type === 'widget-ready');
    expect(ready).toBeDefined();
    const cards = (ready as { payload: { patch: { data: { cards: Array<{ emoji: string }> ; allowCustom: boolean } } } })
      .payload.patch.data.cards;
    expect(cards).toHaveLength(8);
    expect(new Set(cards.map((card) => card.emoji)).size).toBe(8);
    expect(
      (ready as { payload: { patch: { data: { allowCustom: boolean } } } })
        .payload.patch.data.allowCustom
    ).toBe(true);

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
    expect(cards).toHaveLength(8);
  });

  it('候选不足或重复时用确定性兜底补满 8 张', async () => {
    const provider = makeProvider({
      proposeScenes: [
        MOCK_SCENES[0],
        { ...MOCK_SCENES[0], id: 'restaurant-copy' },
      ],
    });
    const events = await collect(makeCtx(provider));

    const ready = events.find((e) => e.type === 'widget-ready');
    const cards = (ready as { payload: { patch: { data: { cards: { id: string; title: string; difficulty: string }[] } } } })
      .payload.patch.data.cards;
    expect(cards).toHaveLength(8);
    expect(cards.filter((c) => c.title === '餐厅点餐')).toHaveLength(1);
    expect(cards.some((c) => c.id === 'cafe-ordering')).toBe(true);
    expect(cards.every((c) => c.difficulty)).toBe(true);
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

  it('难度反馈会说明等级调整并切回 scene_selecting', async () => {
    const provider = makeProvider({ proposeScenes: MOCK_SCENES });
    const events = await collect(
      makeCtx(
        provider,
        { type: 'request-new-scenes' },
        'awaiting_next',
        {
          difficultyFeedback: {
            direction: 'down',
            previousLevel: 'B1',
            nextLevel: 'A2',
            changed: true,
          },
        }
      )
    );

    const text = events.find((e) => e.type === 'text-chunk') as {
      payload: { text: string };
    };
    expect(text.payload.text).toContain('从 B1 降低到 A2');
    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string };
    };
    expect(transition.payload.nextLearningState).toBe('scene_selecting');
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
        payload: {
          sceneId: 'restaurant-ordering',
          title: '餐厅点餐',
          description: '在餐厅点餐和结账',
          knowledgePoint: '礼貌请求',
          difficulty: 'B1',
        },
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
    expect(dialogue!.title).toBe('餐厅点餐');
    expect(getConversation(db, conversationId, userId)?.title).toBe('餐厅点餐');
  });

  it('自由文本自定义场景 → 直接生成 dialogue,不重新推荐 8 张卡', async () => {
    const toolsSeen: string[] = [];
    const provider = makeProvider({
      toolsSeen,
      dialogue: {
        roles: ['Player A', 'Player B'],
        turns: [
          { role: 'Player A', en: 'Do you want to play a game?', zh: '你想打游戏吗?' },
          { role: 'Player B', en: 'Yes, let us play together.', zh: '想,我们一起玩吧。' },
          { role: 'Player A', en: 'Which game do you like?', zh: '你喜欢哪个游戏?' },
          { role: 'Player B', en: 'I like this one.', zh: '我喜欢这个。' },
        ],
      },
    });
    const events = await collect(
      makeCtx(provider, undefined, 'scene_selecting', {
        customSceneText: '和朋友打游戏',
      })
    );

    expect(toolsSeen).toEqual(['generate_scene_dialogue']);
    expect(
      events.find(
        (e) =>
          e.type === 'widget-init' &&
          (e as { payload: { widget: { type: string } } }).payload.widget
            .type === 'scene-cards'
      )
    ).toBeUndefined();
    const text = events
      .filter((event) => event.type === 'text-chunk')
      .map((event) => (event as { payload: { text: string } }).payload.text)
      .join('');
    expect(text).toContain('和朋友打游戏');
    expect(text).not.toContain('准备 8 个场景');

    const dialogue = getActiveSceneDialogue(db, conversationId);
    expect(dialogue).not.toBeNull();
    expect(dialogue!.sceneId).toMatch(/^custom-/);
    expect(dialogue!.title).toBe('和朋友打游戏');
    expect(listSceneHistory(db, userId)).toContain('和朋友打游戏');

    const transition = events.find((e) => e.type === 'state-transition') as {
      payload: { nextLearningState: string; activeSkill: string | null };
    };
    expect(transition.payload.nextLearningState).toBe('practicing');
    expect(transition.payload.activeSkill).toBe('practice');
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
