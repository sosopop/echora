/**
 * smoke:learning — 学习闭环 E2E 烟雾测试(确定性 ScriptedProvider)
 *
 * 覆盖 PRD §5.1 + §5.2 验收点。13 场景:
 *   A · 完整闭环(register → onboarding → scene-select → 阶段 1*2 → 阶段 2*2 → 阶段 3*2 → 阶段 4*2 → awaiting_next → review → retry)
 *   B · 换一批 → 候选过滤已用
 *   C · scene_history 累计 10 → 第 11 次 prune
 *   D · 答错 → retry_count=1 保持 practicing
 *   E · 同题再错 → retry_count=2 + needs_review + 降难替换题
 *   F · grading 中尝试换场景 → router 拒(scene-select 不在 grading allowedStates)
 *   G · 重复提交同 attempt → ATTEMPT_LOCKED
 *   H · /send 同时传 text + action → zod 拒
 *   I · provider chat 抛 → SkillEvent error,无 fallback
 *   J · grade 后续 → 阶段 1 全过自动进阶段 2
 *   K · explain 追问 → follow-up-source + 基于最近批改解释
 *   L · 低置信度路由 → intent-confirm
 *   M · archived 会话继续练习 → 400 且不创建消息
 */

import { setTimeout as delay } from 'node:timers/promises';
import { startTestApp } from './_helpers/testApp.js';
import {
  ScriptedProvider,
  type ChatScript,
} from './_helpers/scriptedProvider.js';
import type { AIProvider } from '../../server/ai/types.js';
import type {
  RouterInput,
  RouterDecision,
  SkillEvent,
} from '../../shared/skill.js';

/* ============================================================
 * 通用辅助
 * ========================================================== */

interface HttpResp<T> {
  status: number;
  body: T;
}

async function httpJson<T>(
  baseUrl: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {}
): Promise<HttpResp<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let parsed: unknown = null;
  try { parsed = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, body: parsed as T };
}

async function collectSseEvents(
  baseUrl: string,
  streamId: string,
  token: string,
  timeoutMs = 5000,
  lastSeq = 0
): Promise<SkillEvent[]> {
  const url =
    `${baseUrl}/api/chat/stream?streamId=${encodeURIComponent(streamId)}`;
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
  };
  if (lastSeq > 0) {
    headers['Last-Event-ID'] = String(lastSeq);
  }
  const res = await fetch(url, { headers });
  if (res.status !== 200 || !res.body) {
    throw new Error(`SSE open 失败 ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: SkillEvent[] = [];
  const deadline = Date.now() + timeoutMs;
  let stopped = false;
  while (!stopped && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) =>
        setTimeout(() => r({ done: true, value: undefined }), Math.max(remaining, 0))
      ),
    ]);
    const { done, value } = result as { done: boolean; value: Uint8Array | undefined };
    if (!done) {
      buf += decoder.decode(value, { stream: true });
    }
    const drained = drainSseBuffer(buf, (evt) => {
      events.push(evt);
      if (evt.type === 'done' || evt.type === 'error') {
        stopped = true;
      }
    });
    buf = drained.rest;
    if (done) break;
  }
  if (!stopped && buf.trim().length > 0) {
    const drained = drainSseBuffer(`${buf}\n\n`, (evt) => {
      events.push(evt);
    });
    buf = drained.rest;
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  return events;
}

function drainSseBuffer(
  buf: string,
  onEvent: (event: SkillEvent) => void
): { rest: string } {
  const parts = buf.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) continue;
    try {
      onEvent(JSON.parse(dataLine.substring('data: '.length)) as SkillEvent);
    } catch {
      /* skip */
    }
  }
  return { rest };
}

async function registerUser(
  baseUrl: string
): Promise<{ token: string; userId: number }> {
  const email = `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@echora.dev`;
  const res = await httpJson<{ data: { token: string; user: { id: number } } }>(
    baseUrl, 'POST', '/api/auth/register',
    { body: { email, password: 'learn-pwd-12345' } }
  );
  if (res.status !== 201) throw new Error(`register 失败 ${res.status}`);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

async function setProfileComplete(
  baseUrl: string,
  token: string
): Promise<void> {
  await httpJson(baseUrl, 'PUT', '/api/profile', {
    token,
    body: { name: '学习者', level: 'B1' },
  });
}

async function createConv(
  baseUrl: string,
  token: string,
  state: 'scene_selecting' | 'practicing' | 'grading' = 'scene_selecting'
): Promise<number> {
  const res = await httpJson<{ data: { id: number } }>(
    baseUrl, 'POST', '/api/chat/conversations',
    { token, body: { learningState: state } }
  );
  return res.body.data.id;
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function eventsByType(events: SkillEvent[], type: SkillEvent['type']): SkillEvent[] {
  return events.filter((e) => e.type === type);
}
function widgetReadyDataByType<T>(
  events: SkillEvent[],
  type: string
): T | null {
  const widgetTypes = new Map<string, string>();
  for (const event of events) {
    if (event.type !== 'widget-init') continue;
    const payload = event.payload as { widget?: { id?: string; type?: string } };
    if (payload.widget?.id && payload.widget.type) {
      widgetTypes.set(payload.widget.id, payload.widget.type);
    }
  }
  for (const event of events) {
    if (event.type !== 'widget-ready') continue;
    const payload = event.payload as {
      widgetId?: string;
      patch?: { data?: unknown };
    };
    if (payload.widgetId && widgetTypes.get(payload.widgetId) === type) {
      return payload.patch?.data as T;
    }
  }
  return null;
}
function requireWidgetReadyDataByType<T>(
  events: SkillEvent[],
  type: string,
  label: string
): T {
  const data = widgetReadyDataByType<T>(events, type);
  if (!data) throw new Error(`missing ${type} widget-ready: ${label}`);
  return data;
}

/* ============================================================
 * 测试脚本工厂 — 共用 provider 配置
 * ========================================================== */

/**
 * 默认 router:按学习态选 skill。
 *   onboarding → onboarding
 *   scene_selecting → scene-select
 *   practicing → grade(有 submit-answer action) 否则 practice
 *   awaiting_next → general-chat
 */
function defaultRouteFn(input: RouterInput): RouterDecision {
  const state = input.currentLearningState;
  if (state === 'onboarding') {
    return { skillName: 'onboarding', params: {}, confidence: 0.95, rationale: 'state=onboarding' };
  }
  if (state === 'scene_selecting') {
    return { skillName: 'scene-select', params: {}, confidence: 0.95, rationale: 'state=scene_selecting' };
  }
  if (state === 'practicing') {
    // 若用户文本是 [action:submit-answer] → grade,否则 practice
    if (input.userText.includes('submit-answer')) {
      return { skillName: 'grade', params: {}, confidence: 0.95, rationale: 'submit-answer action' };
    }
    return { skillName: 'practice', params: {}, confidence: 0.95, rationale: 'state=practicing' };
  }
  return { skillName: 'general-chat', params: {}, confidence: 0.9, rationale: 'default' };
}

/**
 * 默认 chat 脚本:支持 propose_scenes / generate_scene_dialogue / grade_answer。
 */
const defaultScripts: ChatScript[] = [
  // grade_answer:答正确(score=90,用户消息含 "正确" 关键词时返回 isCorrect=true)
  {
    match: '正确',
    events: [
      {
        type: 'tool-use',
        toolName: 'grade_answer',
        input: {
          score: 90, is_correct: true,
          reference_answer: 'reference',
          explanation: '答得对', tags: [],
        },
      },
      { type: 'message-stop', stopReason: 'tool_use' },
    ],
  },
  // grade_answer:答错(用户消息含 "错误" 关键词)
  {
    match: '错误',
    events: [
      {
        type: 'tool-use',
        toolName: 'grade_answer',
        input: {
          score: 30, is_correct: false,
          reference_answer: 'reference',
          explanation: '不对', tags: ['preposition'],
        },
      },
      { type: 'message-stop', stopReason: 'tool_use' },
    ],
  },
  // propose_scenes(scene-select 分支 2)+ generate_scene_dialogue(分支 1)
  // 由于 ScriptedProvider 只能按 user content 匹配,我们用 "" 兜底:
  // - 若是 propose_scenes 调用(提到 generate scenes),返候选;
  // - 若是 generate_scene_dialogue 调用(提到 dialogue),返对话
  // 简化:用一个兜底,同时含两种 tool input(只有一个会被对方 tool_choice 选中)
  // 实际上 ScriptedProvider 不看 tool_choice,所以两个 tool-use 都会发。
  // 但下游只 yield 命中 toolName 的,所以无害。
  {
    match: '',
    events: [
      {
        type: 'tool-use',
        toolName: 'propose_scenes',
        input: {
          scenes: [
            { id: 'cafe', topic: 'cafe order', title: '咖啡店', description: '点单', knowledgePoint: '礼貌请求', difficulty: 'B1' },
            { id: 'taxi', topic: 'taxi ride', title: '打车', description: '去机场', knowledgePoint: '介词', difficulty: 'B1' },
            { id: 'shop', topic: 'shopping', title: '购物', description: '挑选', knowledgePoint: '比较级', difficulty: 'B1' },
          ],
        },
      },
      {
        type: 'tool-use',
        toolName: 'generate_scene_dialogue',
        input: {
          roles: ['Customer', 'Server'],
          turns: [
            { role: 'Server', en: 'Welcome.', zh: '欢迎光临。' },
            { role: 'Customer', en: 'A coffee please.', zh: '一杯咖啡谢谢。' },
            { role: 'Server', en: 'Hot or iced?', zh: '热的还是冰的?' },
            { role: 'Customer', en: 'Hot please.', zh: '热的谢谢。' },
            { role: 'Server', en: 'Three dollars.', zh: '三美元。' },
            { role: 'Customer', en: 'Here you go.', zh: '给你。' },
          ],
        },
      },
      { type: 'message-stop', stopReason: 'tool_use' },
    ],
  },
];

function buildLearningProvider(opts: {
  routeFn?: (i: RouterInput) => RouterDecision;
  extraScripts?: ChatScript[];
} = {}): AIProvider {
  return new ScriptedProvider({
    routeFn: opts.routeFn ?? defaultRouteFn,
    chatScripts: opts.extraScripts
      ? [...opts.extraScripts, ...defaultScripts]
      : defaultScripts,
  });
}

/* ============================================================
 * Scenarios
 * ========================================================== */

interface Scenario {
  id: string;
  title: string;
  run(): Promise<void>;
}
const scenarios: Scenario[] = [];
function scenario(id: string, title: string, run: () => Promise<void>): void {
  scenarios.push({ id, title, run });
}

/* ------- A · 完整闭环 ------- */
scenario('A', '完整闭环(scene → 阶段 1-4 各 2 题 → awaiting_next → review → retry)', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');

    // 1. 默认进 scene-select → 候选
    let s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '看看场景' } }
    );
    await delay(80);
    let e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    assertTrue(eventsByType(e, 'widget-ready').length >= 1, 'scene-select widget-ready');

    // 2. 选场景 → 生成 dialogue + 转 practicing
    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'select-scene', payload: { sceneId: 'cafe' } } } }
    );
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const t1 = eventsByType(e, 'state-transition');
    assertEq(t1.length, 1, 'select-scene transition');
    assertEq((t1[0] as { payload: { nextLearningState: string } }).payload.nextLearningState, 'practicing', 'to practicing');
    let currentAttemptId = requireWidgetReadyDataByType<{ attemptId: number }>(
      e,
      'exercise-card',
      'select-scene first exercise'
    ).attemptId;
    assertTrue(currentAttemptId > 0, 'select-scene got first attemptId');

    // 3-10. 阶段 1-4 各两题;答对后同一条 grade 流自动带出下一题
    let lastTransition: string | null = null;
    for (let i = 0; i < 8; i++) {
      // 提交正确答案
      s = await httpJson<{ data: { streamId: string } }>(
        app.baseUrl, 'POST', '/api/chat/send',
        {
          token,
          body: {
            conversationId: convId,
            action: {
              type: 'submit-answer',
              payload: { attemptId: currentAttemptId, answer: '正确答案' },
            },
          },
        }
      );
      await delay(80);
      e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
      const tr = eventsByType(e, 'state-transition');
      if (tr.length > 0) {
        lastTransition = (tr[0] as { payload: { nextLearningState: string } }).payload.nextLearningState;
      }
      if (i < 7) {
        currentAttemptId = requireWidgetReadyDataByType<{ attemptId: number }>(
          e,
          'exercise-card',
          `q${i + 2} auto next exercise`
        ).attemptId;
        assertTrue(currentAttemptId > 0, `q${i + 2} got attemptId`);
      }
    }
    assertEq(lastTransition, 'awaiting_next', '完成 4 阶段后转 awaiting_next');

    // 11. 完成后发送复盘 → 真实 progress-summary
    s = await httpJson<{ data: { streamId: string; decision: RouterDecision } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '复盘' } }
    );
    assertEq(s.body.data.decision.skillName, 'review', '复盘确定性路由 review');
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const reviewTransition = eventsByType(e, 'state-transition')[0] as {
      payload: { nextLearningState: string };
    };
    assertEq(reviewTransition.payload.nextLearningState, 'reviewing', '复盘后转 reviewing');
    const summaryReady = eventsByType(e, 'widget-ready')[0] as {
      payload: {
        patch: {
          data: {
            sceneName: string;
            questionsCount: number;
            averageScore: number;
            categoryCounts: { exact: number; similar: number; incorrect: number };
            masteries: Array<{ tag: string; score: number }>;
            nextSuggestions: Array<{ title: string }>;
          };
        };
      };
    };
    assertTrue(summaryReady.payload.patch.data.sceneName.length > 0, '复盘场景名非空');
    assertEq(summaryReady.payload.patch.data.questionsCount, 8, '复盘题数');
    assertEq(summaryReady.payload.patch.data.averageScore, 90, '复盘内部平均分');
    assertEq(summaryReady.payload.patch.data.categoryCounts.similar, 8, '复盘三档分布');
    assertTrue(summaryReady.payload.patch.data.masteries.length > 0, '复盘包含掌握度');
    assertTrue(summaryReady.payload.patch.data.nextSuggestions.length > 0, '复盘包含下一步建议');

    // 12. 从复盘进入重练 → stage=5 exercise-card,下一题仍回 retry
    s = await httpJson<{ data: { streamId: string; decision: RouterDecision } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '重练 missing_word' } }
    );
    assertEq(s.body.data.decision.skillName, 'retry', '重练确定性路由 retry');
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const retryReady = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { attemptId: number; stage: number; questionNo: number } } };
    };
    assertEq(retryReady.payload.patch.data.stage, 5, '重练题使用 stage=5');
    assertEq(retryReady.payload.patch.data.questionNo, 1, '重练第 1 题');
    const retryAttemptId = retryReady.payload.patch.data.attemptId;

    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      {
        token,
        body: {
          conversationId: convId,
          action: { type: 'submit-answer', payload: { attemptId: retryAttemptId, answer: '正确答案' } },
        },
      }
    );
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const retryTransitions = eventsByType(e, 'state-transition') as Array<{
      payload: { nextLearningState: string; activeSkill: string | null };
    }>;
    assertTrue(
      !retryTransitions.some((tr) => tr.payload.nextLearningState === 'reviewing'),
      '重练第 1 题通过不结束专项'
    );
    assertTrue(
      retryTransitions.some((tr) => tr.payload.activeSkill === 'retry'),
      '重练第 1 题通过后继续 retry'
    );
    const nextRetry = requireWidgetReadyDataByType<{
      stage: number;
      questionNo: number;
    }>(e, 'exercise-card', 'retry auto next');
    assertEq(nextRetry.stage, 5, '重练自动下一题仍 stage=5');
    assertEq(nextRetry.questionNo, 2, '重练自动进入第 2 题');
  } finally {
    await app.cleanup();
  }
});

/* ------- B · 换一批 → 候选过滤已用 ------- */
scenario('B', '换一批 candidates 过滤已用 topic', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token, userId } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');

    // 预先把 cafe order 标已用
    app.db.prepare('INSERT INTO scene_history (user_id, scene_topic) VALUES (?, ?)')
      .run(userId, 'cafe order');

    const s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'request-new-scenes' } } }
    );
    await delay(80);
    const e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const ready = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { cards: { id: string }[] } } };
    };
    const ids = ready.payload.patch.data.cards.map((c) => c.id);
    assertTrue(!ids.includes('cafe'), '已用 cafe 不应再出现');
  } finally {
    await app.cleanup();
  }
});

/* ------- C · scene_history prune ------- */
scenario('C', 'scene_history 累计 10 后第 11 次自动 prune', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token, userId } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');

    // 预填 10 条已用
    const ins = app.db.prepare('INSERT INTO scene_history (user_id, scene_topic) VALUES (?, ?)');
    for (let i = 1; i <= 10; i++) ins.run(userId, `old-topic-${i}`);

    // select-scene 一次 → 新插入 + prune 最旧
    const s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'select-scene', payload: { sceneId: 'newscene' } } } }
    );
    await delay(80);
    await collectSseEvents(app.baseUrl, s.body.data.streamId, token);

    const count = app.db.prepare<[number], { c: number }>(
      'SELECT COUNT(*) AS c FROM scene_history WHERE user_id = ?'
    ).get(userId);
    assertEq(count?.c, 10, '仍 10 条(prune 最旧后插新)');
    const topics = app.db.prepare<[number], { scene_topic: string }>(
      'SELECT scene_topic FROM scene_history WHERE user_id = ? ORDER BY used_at DESC'
    ).all(userId).map((r) => r.scene_topic);
    assertTrue(topics.includes('newscene'), 'newscene 在列表');
    assertTrue(!topics.includes('old-topic-1'), 'old-topic-1 已被 prune');
  } finally {
    await app.cleanup();
  }
});

/* ------- D · 答错 → retry_count=1 ------- */
scenario('D', '答错 → retry_count=1 + 无 state-transition', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');

    // 选场景 + 出题
    let s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'select-scene', payload: { sceneId: 'cafe' } } } }
    );
    await delay(80);
    await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '出题' } }
    );
    await delay(80);
    let e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const ready = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { attemptId: number } } };
    };
    const attemptId = ready.payload.patch.data.attemptId;

    // 答错
    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      {
        token,
        body: {
          conversationId: convId,
          action: { type: 'submit-answer', payload: { attemptId, answer: '错误答案' } },
        },
      }
    );
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    assertEq(eventsByType(e, 'state-transition').length, 0, '不应 transition');

    const row = app.db.prepare<[number], { retry_count: number; status: string }>(
      'SELECT retry_count, status FROM exercise_attempts WHERE id = ?'
    ).get(attemptId);
    assertEq(row?.retry_count, 1, 'retry_count=1');
    assertEq(row?.status, 'graded', 'status=graded(已批改但未通过)');
  } finally {
    await app.cleanup();
  }
});

/* ------- E · 同题再错 → retry_count=2 + needs_review + replacement ------- */
scenario('E', '同题答错 2 次 → markNeedsReview + 降难替换题', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');
    // 选场景 + 出题
    await httpJson(app.baseUrl, 'POST', '/api/chat/send', {
      token, body: { conversationId: convId, action: { type: 'select-scene', payload: { sceneId: 'cafe' } } },
    });
    await delay(80);
    let s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '出题' } }
    );
    await delay(80);
    let e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const ready = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { attemptId: number } } };
    };
    const attemptId = ready.payload.patch.data.attemptId;

    // 第一次答错(retry_count → 1)
    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'submit-answer', payload: { attemptId, answer: '错误1' } } } }
    );
    await delay(80);
    await collectSseEvents(app.baseUrl, s.body.data.streamId, token);

    // 第二次答错(retry_count → 2,markNeedsReview)
    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'submit-answer', payload: { attemptId, answer: '错误2' } } } }
    );
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);

    const row = app.db.prepare<[number], { retry_count: number; status: string }>(
      'SELECT retry_count, status FROM exercise_attempts WHERE id = ?'
    ).get(attemptId);
    assertEq(row?.retry_count, 2, 'retry_count=2');
    assertEq(row?.status, 'needs_review', 'status=needs_review');
    const replacement = requireWidgetReadyDataByType<{
      stage: number;
      remediationKind?: string;
    }>(e, 'exercise-card', 'E replacement exercise');
    assertEq(replacement.stage, 5, '替换题 stage=5');
    assertEq(replacement.remediationKind, 'replacement', '替换题 remediationKind');
  } finally {
    await app.cleanup();
  }
});

/* ------- F · grading 中尝试换场景 → router 拒 ------- */
scenario('F', 'grading 态调 scene-select → router state_not_allowed (502)', async () => {
  // 让 router 在 grading 态也返回 scene-select,看是否被 router 校验拒
  const provider = buildLearningProvider({
    routeFn: () => ({
      skillName: 'scene-select', params: {}, confidence: 0.9,
      rationale: 'force scene-select (test)',
    }),
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'grading');

    const s = await httpJson<{ error?: { code: string; message: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '换场景' } }
    );
    assertEq(s.status, 502, '502 PROVIDER_ERROR');
    assertEq(s.body.error?.code, 'PROVIDER_ERROR', 'error code');
    assertTrue(
      (s.body.error?.message ?? '').includes('grading') ||
      (s.body.error?.message ?? '').includes('state'),
      `错误消息含 state 提示: ${s.body.error?.message}`
    );
  } finally {
    await app.cleanup();
  }
});

/* ------- G · 重复提交同 attempt → ATTEMPT_LOCKED ------- */
scenario('G', '重复提交同 attempt(已标 needs_review 后) → ATTEMPT_LOCKED', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');
    await httpJson(app.baseUrl, 'POST', '/api/chat/send', {
      token, body: { conversationId: convId, action: { type: 'select-scene', payload: { sceneId: 'cafe' } } },
    });
    await delay(80);
    let s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '出题' } }
    );
    await delay(80);
    let e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const ready = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { attemptId: number } } };
    };
    const attemptId = ready.payload.patch.data.attemptId;

    // 错 2 次 → needs_review
    for (let i = 0; i < 2; i++) {
      s = await httpJson<{ data: { streamId: string } }>(
        app.baseUrl, 'POST', '/api/chat/send',
        { token, body: { conversationId: convId, action: { type: 'submit-answer', payload: { attemptId, answer: '错误' } } } }
      );
      await delay(80);
      await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    }
    // 第 3 次尝试 → ATTEMPT_LOCKED error event
    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'submit-answer', payload: { attemptId, answer: '再来' } } } }
    );
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const err = eventsByType(e, 'error')[0] as { payload: { code: string } };
    assertEq(err?.payload.code, 'ATTEMPT_LOCKED', '第 3 次提交 → ATTEMPT_LOCKED');
  } finally {
    await app.cleanup();
  }
});

/* ------- H · /send 同时传 text + action → zod 拒 ------- */
scenario('H', '/send 同时传 text + action → 400 VALIDATION_FAILED', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const res = await httpJson<{ error?: { code: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { text: 'hi', action: { type: 'next-question' } } }
    );
    assertEq(res.status, 400, '400 zod');
    assertEq(res.body.error?.code, 'VALIDATION_FAILED', 'error code');
  } finally {
    await app.cleanup();
  }
});

/* ------- I · provider chat 抛 → SkillEvent error ------- */
scenario('I', 'provider chat 抛错 → SkillEvent error 直传客户端', async () => {
  // scene-select 调 chat 时,provider 在 propose_scenes 路径抛
  const provider = new ScriptedProvider({
    routeFn: defaultRouteFn,
    // 没有任何 script → ScriptedProvider 返 no_script_matched message-stop,
    // scene-select 的 runScenePropose 因 collected=空 抛 'LLM 未返回有效场景候选'
    chatScripts: [],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');

    const s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, action: { type: 'request-new-scenes' } } }
    );
    await delay(80);
    const e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const err = eventsByType(e, 'error')[0] as { payload: { code: string } };
    assertEq(err?.payload.code, 'SCENE_PROPOSE_FAILED', 'scene-select 抛错');
  } finally {
    await app.cleanup();
  }
});

/* ------- J · 阶段 1 全过 → 自动进阶段 2 ------- */
scenario('J', '阶段 1 两题全过后下题为阶段 2(mode=chat)', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');
    // 选场景
    let s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      {
      token, body: { conversationId: convId, action: { type: 'select-scene', payload: { sceneId: 'cafe' } } },
      }
    );
    await delay(80);
    let e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    let currentAttemptId = requireWidgetReadyDataByType<{
      attemptId: number;
      stage: number;
    }>(e, 'exercise-card', 'J first exercise').attemptId;

    // 阶段 1 两题(答对后自动接下一题)
    let stage2Ready: { stage: number } | null = null;
    let stage2Mode: string | null = null;
    for (let i = 0; i < 2; i++) {
      s = await httpJson<{ data: { streamId: string } }>(
        app.baseUrl, 'POST', '/api/chat/send',
        {
          token,
          body: {
            conversationId: convId,
            action: {
              type: 'submit-answer',
              payload: { attemptId: currentAttemptId, answer: '正确' },
            },
          },
        }
      );
      await delay(80);
      e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
      const next = requireWidgetReadyDataByType<{
        attemptId: number;
        stage: number;
      }>(e, 'exercise-card', `J auto next ${i}`);
      if (i === 0) {
        assertEq(next.stage, 1, '第 1 题后仍为阶段 1');
        currentAttemptId = next.attemptId;
      } else {
        stage2Ready = next;
        const mode = eventsByType(e, 'mode-switch').at(-1) as
          | { payload: { mode: string } }
          | undefined;
        stage2Mode = mode?.payload.mode ?? null;
      }
    }
    assertEq(stage2Ready?.stage, 2, '已进阶段 2');
    assertEq(stage2Mode, 'chat', '阶段 2 模式 chat');
  } finally {
    await app.cleanup();
  }
});

/* ------- K · explain 追问最近批改 ------- */
scenario('K', 'explain 追问最近批改 → follow-up-source + 错因解释', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');
    await httpJson(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: {
        conversationId: convId,
        action: { type: 'select-scene', payload: { sceneId: 'cafe' } },
      },
    });
    await delay(80);

    let s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '出题' } }
    );
    await delay(80);
    let e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const ready = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { attemptId: number } } };
    };
    const attemptId = ready.payload.patch.data.attemptId;

    s = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      {
        token,
        body: {
          conversationId: convId,
          action: {
            type: 'submit-answer',
            payload: { attemptId, answer: '错误答案' },
          },
        },
      }
    );
    await delay(80);
    await collectSseEvents(app.baseUrl, s.body.data.streamId, token);

    s = await httpJson<{ data: { streamId: string; decision: RouterDecision } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '为什么错' } }
    );
    assertEq(s.body.data.decision.skillName, 'explain', '为什么错确定性路由 explain');
    await delay(80);
    e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const sourceReady = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { sourceKind: string; sourceLabel: string } } };
    };
    assertEq(sourceReady.payload.patch.data.sourceKind, 'grading', 'explain 来源为 grading');
    assertTrue(
      sourceReady.payload.patch.data.sourceLabel.includes('30 分'),
      'explain 来源含最近批改分数'
    );
    const text = eventsByType(e, 'text-chunk')
      .map((ev) => (ev as { payload: { text: string } }).payload.text)
      .join('');
    assertTrue(text.includes('preposition'), 'explain 文本含错误标签');
    assertTrue(text.includes('我按最近一次批改来讲'), 'explain 文本基于最近批改');
  } finally {
    await app.cleanup();
  }
});

/* ------- L · 低置信度 → intent-confirm ------- */
scenario('L', '低置信度路由 → intent-confirm', async () => {
  const provider = buildLearningProvider({
    routeFn: () => ({
      skillName: 'review',
      params: {},
      confidence: 0.3,
      rationale: 'ambiguous',
    }),
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'scene_selecting');
    app.db
      .prepare('UPDATE conversations SET learning_state = ?, lock_policy = ? WHERE id = ?')
      .run('awaiting_next', 'open', convId);

    const s = await httpJson<{ data: { streamId: string; decision: RouterDecision } }>(
      app.baseUrl, 'POST', '/api/chat/send',
      { token, body: { conversationId: convId, text: '看一下之前的' } }
    );
    assertEq(s.body.data.decision.skillName, 'general-chat', '低置信度转 general-chat intent-confirm');
    assertTrue(
      Boolean((s.body.data.decision.params as { intentConfirm?: unknown }).intentConfirm),
      'decision params 带 intentConfirm'
    );
    await delay(80);
    const e = await collectSseEvents(app.baseUrl, s.body.data.streamId, token);
    const ready = eventsByType(e, 'widget-ready')[0] as {
      payload: { patch: { data: { question: string; choices: Array<{ id: string }> } } };
    };
    assertEq(ready.payload.patch.data.question, '你想让我怎么处理?', 'intent-confirm question');
    assertTrue(
      ready.payload.patch.data.choices.some((choice) => choice.id === 'review'),
      'intent-confirm 包含复盘选项'
    );
  } finally {
    await app.cleanup();
  }
});

/* ------- M · archived 只读 ------- */
scenario('M', 'archived 会话继续练习 → 400 且不创建消息', async () => {
  const provider = buildLearningProvider();
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    await setProfileComplete(app.baseUrl, token);
    const convId = await createConv(app.baseUrl, token, 'awaiting_next');
    app.db
      .prepare(
        `UPDATE conversations
         SET status = 'archived',
             learning_state = 'archived',
             archived_at = datetime('now')
         WHERE id = ?`
      )
      .run(convId);
    const before = app.db
      .prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?'
      )
      .get(convId)?.c;

    const res = await httpJson<{ error?: { code: string; message: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: '继续练习' } }
    );

    assertEq(res.status, 400, 'archived send 400');
    assertEq(res.body.error?.code, 'VALIDATION_FAILED', 'archived error code');
    assertTrue(
      (res.body.error?.message ?? '').includes('已归档'),
      'archived error message'
    );
    const after = app.db
      .prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?'
      )
      .get(convId)?.c;
    assertEq(after, before, 'archived 拒绝时不创建消息');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Runner
 * ========================================================== */

async function main(): Promise<void> {
  let passed = 0, failed = 0;
  console.log(`[smoke:learn] === ${scenarios.length} scenarios ===\n`);
  for (const sc of scenarios) {
    const t0 = Date.now();
    try {
      await sc.run();
      passed += 1;
      console.log(`[smoke:learn] ✓ ${sc.id} ${sc.title} (${Date.now() - t0}ms)`);
    } catch (e) {
      failed += 1;
      console.error(`[smoke:learn] ✗ ${sc.id} ${sc.title} (${Date.now() - t0}ms)`);
      console.error(`  → ${(e as Error).message}`);
    }
  }
  console.log('');
  if (failed > 0) {
    console.error(`[smoke:learn] FAILED ${failed} / ${scenarios.length}`);
    process.exit(1);
  }
  console.log(`[smoke:learn] PASSED ${passed} / ${scenarios.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[smoke:learn] crash:', e);
  process.exit(1);
});
