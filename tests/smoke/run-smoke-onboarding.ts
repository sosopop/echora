/**
 * smoke:onboarding — Onboarding 工作流端到端烟雾测试
 *
 * 与现有 run-smoke.ts(stub provider 通用)互补:
 * - 注入 ScriptedProvider(确定性 mock,可脚本化 chat 事件)
 * - 通过 HTTP 层(不绕过 chat.ts 背景任务)
 * - 多场景覆盖正常路径 + 异常分支
 *
 * 每个场景独立 startTestApp + cleanup,DB 隔离。任一失败 → exit 1。
 *
 * 场景:A 完整多轮 / B 短路 / C 不调工具 / D 非法 CEFR /
 *      E disableChat / F state_not_allowed / G route 抛错 /
 *      H lastSeq 续传 / I 学习态转移后 / J orphan 快照
 */

import { setTimeout as delay } from 'node:timers/promises';
import { startTestApp, type TestAppHandle } from './_helpers/testApp.js';
import { ScriptedProvider, type ChatScript } from './_helpers/scriptedProvider.js';
import { streamBus } from '../../server/services/streamBus.js';
import type { AIProvider } from '../../server/ai/types.js';
import type {
  RouterInput,
  RouterDecision,
  SkillEvent,
} from '../../shared/skill.js';

/* ============================================================
 * HTTP / SSE 辅助
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, body: parsed as T };
}

interface SseCollectOptions {
  /** 总超时 ms */
  timeoutMs?: number;
  /** 收到该类型事件后立即停止 */
  stopAt?: SkillEvent['type'][];
  /** 最多收多少事件 */
  maxEvents?: number;
}

async function collectSseEvents(
  baseUrl: string,
  streamId: string,
  token: string,
  opts: SseCollectOptions = {},
  lastSeq = 0
): Promise<SkillEvent[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const stopAt = opts.stopAt ?? ['done', 'error'];
  const maxEvents = opts.maxEvents ?? 100;

  const url =
    `${baseUrl}/api/chat/stream?streamId=${encodeURIComponent(streamId)}`;
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
  };
  if (lastSeq > 0) {
    headers['Last-Event-ID'] = String(lastSeq);
  }
  const res = await fetch(url, {
    headers,
  });
  if (res.status !== 200 || !res.body) {
    throw new Error(`SSE open 失败 ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: SkillEvent[] = [];
  const deadline = Date.now() + timeoutMs;
  let stopped = false;

  while (!stopped && Date.now() < deadline && events.length < maxEvents) {
    const remaining = deadline - Date.now();
    const readPromise = reader.read();
    const result = await Promise.race([
      readPromise,
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(
          () => resolve({ done: true, value: undefined }),
          Math.max(remaining, 0)
        )
      ),
    ]);
    const { done, value } = result as {
      done: boolean;
      value: Uint8Array | undefined;
    };
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const dataLine = part
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const json = dataLine.substring('data: '.length);
      try {
        const evt = JSON.parse(json) as SkillEvent;
        events.push(evt);
        if (stopAt.includes(evt.type)) {
          stopped = true;
          break;
        }
      } catch {
        /* skip */
      }
    }
  }
  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
  return events;
}

/* ============================================================
 * 通用注册 + onboarding 会话辅助
 * ========================================================== */

async function registerUser(
  baseUrl: string,
  emailPrefix = 'onb-test'
): Promise<{ token: string; userId: number; email: string }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@echora.dev`;
  const res = await httpJson<{ data: { token: string; user: { id: number } } }>(
    baseUrl,
    'POST',
    '/api/auth/register',
    { body: { email, password: 'onb-pwd-12345' } }
  );
  if (res.status !== 201) {
    throw new Error(`register 失败 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.data.token,
    userId: res.body.data.user.id,
    email,
  };
}

async function createOnboardingConv(
  baseUrl: string,
  token: string,
  learningState: 'onboarding' | 'practicing' | 'scene_selecting' = 'onboarding'
): Promise<number> {
  const res = await httpJson<{ data: { id: number } }>(
    baseUrl,
    'POST',
    '/api/chat/conversations',
    { token, body: { learningState } }
  );
  if (res.status !== 201) {
    throw new Error(`createConv 失败 ${res.status}`);
  }
  return res.body.data.id;
}

/* ============================================================
 * 断言辅助
 * ========================================================== */

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function eventsByType(
  events: SkillEvent[],
  type: SkillEvent['type']
): SkillEvent[] {
  return events.filter((e) => e.type === type);
}

/* ============================================================
 * Scenario 框架
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

/* ============================================================
 * Scenario A — 完整多轮(从空到完成)
 * ========================================================== */

scenario('A', '完整多轮(从空到完成)', async () => {
  const provider = new ScriptedProvider({
    chatScripts: [
      {
        match: '张三',
        events: [
          { type: 'text-delta', text: '好的张三,' },
          {
            type: 'tool-use',
            toolName: 'update_profile',
            input: { name: '张三' },
          },
          { type: 'message-stop', stopReason: 'tool_use' },
        ],
      },
      {
        match: 'B1',
        events: [
          { type: 'text-delta', text: '记下了 B1。' },
          {
            type: 'tool-use',
            toolName: 'update_profile',
            input: { level: 'B1' },
          },
          { type: 'message-stop', stopReason: 'tool_use' },
        ],
      },
    ],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);

    // turn 1: 我叫张三
    let send = await httpJson<{
      data: { streamId: string; decision: { skillName: string } };
    }>(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: { conversationId: convId, text: '我叫张三' },
    });
    assertEq(send.status, 202, 'turn1 /send status');
    assertEq(send.body.data.decision.skillName, 'onboarding', 'turn1 skillName');
    await delay(80);
    let events = await collectSseEvents(app.baseUrl, send.body.data.streamId, token);
    assertTrue(eventsByType(events, 'text-chunk').length >= 1, 'turn1 text-chunk');
    assertEq(eventsByType(events, 'state-transition').length, 0, 'turn1 no transition (level missing)');
    assertEq(eventsByType(events, 'done').length, 1, 'turn1 done');

    let prof = await httpJson<{ data: { name: string | null; level: string | null } }>(
      app.baseUrl,
      'GET',
      '/api/profile',
      { token }
    );
    assertEq(prof.body.data.name, '张三', 'turn1 profile.name');
    assertEq(prof.body.data.level, null, 'turn1 profile.level still null');

    let me = await httpJson<{ data: { onboardingCompleted: boolean } }>(
      app.baseUrl,
      'GET',
      '/api/auth/me',
      { token }
    );
    assertEq(me.body.data.onboardingCompleted, false, 'turn1 onboardingCompleted false');

    // turn 2: B1
    send = await httpJson<{
      data: { streamId: string; decision: { skillName: string } };
    }>(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: { conversationId: convId, text: 'B1' },
    });
    assertEq(send.status, 202, 'turn2 /send status');
    await delay(80);
    events = await collectSseEvents(app.baseUrl, send.body.data.streamId, token);
    assertTrue(eventsByType(events, 'text-chunk').length >= 1, 'turn2 text-chunk');
    const transitions = eventsByType(events, 'state-transition');
    assertEq(transitions.length, 1, 'turn2 has state-transition');
    assertEq(
      (transitions[0] as { payload: { nextLearningState: string } }).payload.nextLearningState,
      'scene_selecting',
      'turn2 transition target'
    );
    assertEq(eventsByType(events, 'done').length, 1, 'turn2 done');

    prof = await httpJson<{ data: { name: string | null; level: string | null } }>(
      app.baseUrl,
      'GET',
      '/api/profile',
      { token }
    );
    assertEq(prof.body.data.name, '张三', 'turn2 profile.name');
    assertEq(prof.body.data.level, 'B1', 'turn2 profile.level');

    me = await httpJson<{ data: { onboardingCompleted: boolean } }>(
      app.baseUrl,
      'GET',
      '/api/auth/me',
      { token }
    );
    assertEq(me.body.data.onboardingCompleted, true, 'turn2 onboardingCompleted true');

    // 会话学习态切到 scene_selecting
    const conv = await httpJson<{
      data: { learningState: string }[];
    }>(app.baseUrl, 'GET', '/api/chat/conversations', { token });
    const updated = conv.body.data.find((c) => true);
    assertEq(updated?.learningState, 'scene_selecting', 'conversation.learningState');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario B — 短路(已完成 profile 再进 onboarding)
 * ========================================================== */

scenario('B', '短路(profile 已齐时不调 LLM 直接转场)', async () => {
  // chat 函数不应被调用,若被调用就抛错 → 测试会捕获到
  let chatCalled = false;
  const provider = new ScriptedProvider({
    chatScripts: [
      {
        match: '',
        events: [
          /* 不会执行 */
        ],
      },
    ],
  });
  // 包装一层,记录 chat 是否被调
  const wrapped: AIProvider = {
    name: 'wrapped',
    route: (i) => provider.route(i),
    chat(req) {
      chatCalled = true;
      return provider.chat!(req);
    },
  };
  const app = await startTestApp({ provider: wrapped });
  try {
    const { token } = await registerUser(app.baseUrl);
    // 直接 PUT profile 跳过 onboarding 采集
    const put = await httpJson<{ data: unknown }>(app.baseUrl, 'PUT', '/api/profile', {
      token,
      body: { name: '已知用户', level: 'B2' },
    });
    assertEq(put.status, 200, 'PUT profile');

    const convId = await createOnboardingConv(app.baseUrl, token);

    const send = await httpJson<{
      data: { streamId: string };
    }>(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: { conversationId: convId, text: 'hi' },
    });
    assertEq(send.status, 202, '/send status');
    await delay(80);
    const events = await collectSseEvents(app.baseUrl, send.body.data.streamId, token);

    assertTrue(!chatCalled, 'provider.chat 不应被调用(短路)');
    assertTrue(
      eventsByType(events, 'text-chunk').length >= 1,
      'short-circuit text-chunk'
    );
    assertEq(eventsByType(events, 'state-transition').length, 1, 'transition');
    assertEq(eventsByType(events, 'done').length, 1, 'done');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario C — AI 不调工具(模糊输入)
 * ========================================================== */

scenario('C', 'AI 不调工具时不写库不转场', async () => {
  const provider = new ScriptedProvider({
    chatScripts: [
      {
        match: '',
        events: [
          { type: 'text-delta', text: '你想聊点什么?' },
          { type: 'message-stop', stopReason: 'end_turn' },
        ],
      },
    ],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);

    const send = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: '你好' } }
    );
    await delay(80);
    const events = await collectSseEvents(app.baseUrl, send.body.data.streamId, token);
    assertTrue(eventsByType(events, 'text-chunk').length >= 1, 'text-chunk');
    assertEq(eventsByType(events, 'state-transition').length, 0, 'no transition');
    assertEq(eventsByType(events, 'done').length, 1, 'done');

    const prof = await httpJson<{ data: { name: string | null; level: string | null } }>(
      app.baseUrl,
      'GET',
      '/api/profile',
      { token }
    );
    assertEq(prof.body.data.name, null, 'profile.name 仍为空');
    assertEq(prof.body.data.level, null, 'profile.level 仍为空');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario D — 工具入参非法 CEFR
 * ========================================================== */

scenario('D', '工具入参非法 CEFR 被 mergeProfileFields 过滤', async () => {
  const provider = new ScriptedProvider({
    chatScripts: [
      {
        match: '李四',
        events: [
          { type: 'text-delta', text: '记下了' },
          {
            type: 'tool-use',
            toolName: 'update_profile',
            input: { name: '李四', level: 'X9' }, // X9 非法
          },
          { type: 'message-stop', stopReason: 'tool_use' },
        ],
      },
    ],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);

    const send = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: '我叫李四,水平超神' } }
    );
    await delay(80);
    const events = await collectSseEvents(app.baseUrl, send.body.data.streamId, token);
    assertEq(eventsByType(events, 'state-transition').length, 0, 'no transition (level invalid)');
    assertEq(eventsByType(events, 'done').length, 1, 'done');

    const prof = await httpJson<{ data: { name: string | null; level: string | null } }>(
      app.baseUrl,
      'GET',
      '/api/profile',
      { token }
    );
    assertEq(prof.body.data.name, '李四', 'name 已落库');
    assertEq(prof.body.data.level, null, 'level 被过滤');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario E — provider.chat 不实现 → SkillEvent error
 * ========================================================== */

scenario('E', 'provider.chat 不实现时 yield error', async () => {
  const provider = new ScriptedProvider({
    disableChat: true,
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);

    const send = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: 'hi' } }
    );
    assertEq(send.status, 202, '/send status (router 仍能选 onboarding)');
    await delay(80);
    const events = await collectSseEvents(app.baseUrl, send.body.data.streamId, token);
    const errors = eventsByType(events, 'error');
    assertEq(errors.length, 1, 'should have error event');
    const errPayload = (errors[0] as { payload: { code: string } }).payload;
    assertEq(errPayload.code, 'PROVIDER_CHAT_UNAVAILABLE', 'error code');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario F — router state_not_allowed
 * ========================================================== */

scenario('F', 'router 拒绝非法 state(无 fallback,直接 502)', async () => {
  const provider = new ScriptedProvider({
    // 故意永远返回 onboarding,即使学习态是 practicing
    routeFn: (input: RouterInput): RouterDecision => ({
      skillName: 'onboarding',
      params: {},
      confidence: 0.95,
      rationale: 'force onboarding (test)',
    }),
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    // 用 PUT 跳过 onboarding 采集,然后建一个 practicing 会话
    await httpJson<unknown>(app.baseUrl, 'PUT', '/api/profile', {
      token,
      body: { name: '甲', level: 'B1' },
    });
    const convId = await createOnboardingConv(app.baseUrl, token, 'practicing');

    const send = await httpJson<{
      error?: { code: string; message: string };
    }>(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: { conversationId: convId, text: 'hi' },
    });
    assertEq(send.status, 502, '/send 应 502');
    assertEq(send.body.error?.code, 'PROVIDER_ERROR', 'error code');
    assertTrue(
      send.body.error!.message.includes('practicing') ||
        send.body.error!.message.includes('state'),
      'error message 含 state 提示: ' + send.body.error?.message
    );
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario G — provider.route 抛错(provider down)
 * ========================================================== */

scenario('G', 'provider.route 抛错时直接 502(无 fallback)', async () => {
  const provider = new ScriptedProvider({
    routeFn: () => {
      throw new Error('upstream 503 service unavailable');
    },
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const send = await httpJson<{
      error?: { code: string; message: string };
    }>(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: { text: 'hi' },
    });
    assertEq(send.status, 502, '/send 应 502');
    assertEq(send.body.error?.code, 'PROVIDER_ERROR', 'error code');
    assertTrue(
      send.body.error!.message.includes('upstream 503'),
      'error message 含 upstream 503: ' + send.body.error?.message
    );
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario H — SSE lastSeq 续传
 * ========================================================== */

scenario('H', 'SSE 断线后用 lastSeq 续传 ring buffer 事件', async () => {
  const provider = new ScriptedProvider({
    chatScripts: [
      {
        match: '',
        delayMs: 30,
        events: [
          { type: 'text-delta', text: 'A' },
          { type: 'text-delta', text: 'B' },
          { type: 'text-delta', text: 'C' },
          {
            type: 'tool-use',
            toolName: 'update_profile',
            input: { name: '续传君', level: 'C1' },
          },
          { type: 'message-stop', stopReason: 'tool_use' },
        ],
      },
    ],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);
    const send = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: 'hi' } }
    );
    // 等待背景任务跑到 done(events 全落 ring buffer)
    await delay(400);
    // 客户端 A:从 lastSeq=0 读全
    const allA = await collectSseEvents(app.baseUrl, send.body.data.streamId, token, {
      timeoutMs: 1000,
    });
    assertTrue(allA.length >= 3, `客户端 A 至少 3 帧, 实得 ${allA.length}`);

    // 客户端 B:从 lastSeq=2 读续传
    const partial = await collectSseEvents(
      app.baseUrl,
      send.body.data.streamId,
      token,
      { timeoutMs: 1000 },
      2
    );
    assertTrue(partial.length >= 1, '客户端 B 应至少续读到 1 帧');
    // 续传内容的 seq 必须 > 2
    const minSeq = Math.min(...partial.map((e) => e.seq));
    assertTrue(minSeq > 2, `续传起始 seq 应 > 2,实得 ${minSeq}`);
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario H2 — SSE ring buffer 丢失后从历史快照恢复
 * ========================================================== */

scenario('H2', 'SSE 缓存丢失后仍可从消息历史快照恢复', async () => {
  const provider = new ScriptedProvider({
    chatScripts: [
      {
        match: '',
        events: [
          { type: 'text-delta', text: '回放内容 A' },
          { type: 'text-delta', text: ' 回放内容 B' },
          { type: 'message-stop', stopReason: 'end_turn' },
        ],
      },
    ],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);
    const send = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: 'hi' } }
    );
    await delay(150);
    streamBus.clear();
    const events = await collectSseEvents(
      app.baseUrl,
      send.body.data.streamId,
      token,
      { timeoutMs: 1000 }
    );
    assertTrue(
      eventsByType(events, 'text-chunk').length >= 1,
      '应从历史快照回放 text-chunk'
    );
    assertEq(eventsByType(events, 'done').length, 1, '应从历史快照回放 done');
  } finally {
    streamBus.clear();
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario I — 学习态转移后下一次 send(scene-select stub)
 * ========================================================== */

scenario('I', 'state-transition 后下次 send 路由到 scene-select', async () => {
  // 注:scene-select stub handler 已注册;routeFn 根据态选 skill
  const provider = new ScriptedProvider({
    routeFn: (input: RouterInput): RouterDecision => {
      if (input.currentLearningState === 'scene_selecting') {
        return {
          skillName: 'scene-select',
          params: {},
          confidence: 0.9,
          rationale: 'scene_selecting state',
        };
      }
      return {
        skillName: 'onboarding',
        params: {},
        confidence: 0.95,
        rationale: 'default',
      };
    },
    chatScripts: [
      {
        match: 'B1',
        events: [
          {
            type: 'tool-use',
            toolName: 'update_profile',
            input: { name: '转场用户', level: 'B1' },
          },
          { type: 'message-stop', stopReason: 'tool_use' },
        ],
      },
      // 默认匹配:scene-select skill 调用 propose_scenes
      {
        match: '',
        events: [
          {
            type: 'tool-use',
            toolName: 'propose_scenes',
            input: {
              scenes: [
                { id: 'cafe', topic: 'cafe order', title: '咖啡店点单', description: '点饮品/打包', knowledgePoint: '礼貌请求', difficulty: 'B1' },
                { id: 'taxi', topic: 'taxi ride', title: '打车', description: '告诉目的地', knowledgePoint: '介词', difficulty: 'B1' },
                { id: 'bookstore', topic: 'bookstore', title: '书店', description: '找书咨询', knowledgePoint: '一般疑问句', difficulty: 'B1' },
              ],
            },
          },
          { type: 'message-stop', stopReason: 'tool_use' },
        ],
      },
    ],
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);

    // 1. 完成 onboarding
    const s1 = await httpJson<{ data: { streamId: string } }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: '我叫转场用户 B1' } }
    );
    await delay(80);
    const e1 = await collectSseEvents(app.baseUrl, s1.body.data.streamId, token);
    assertEq(eventsByType(e1, 'state-transition').length, 1, 'onboarding done');

    // 2. 用同一会话再发一句 → 应被路由到 scene-select(003 真实实现)
    const s2 = await httpJson<{
      data: { streamId: string; decision: { skillName: string } };
    }>(app.baseUrl, 'POST', '/api/chat/send', {
      token,
      body: { conversationId: convId, text: '选个场景吧' },
    });
    assertEq(s2.body.data.decision.skillName, 'scene-select', 'routed to scene-select');
    await delay(80);
    const e2 = await collectSseEvents(app.baseUrl, s2.body.data.streamId, token);
    // scene-select 真实实现:propose 候选 → widget scene-cards + done
    const widgetInits = eventsByType(e2, 'widget-init');
    assertTrue(widgetInits.length >= 1, 'scene-select 应产 widget-init');
    assertEq(eventsByType(e2, 'done').length, 1, 'scene-select done');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Scenario J — /send 502 时 user 消息仍 orphan(行为快照)
 * ========================================================== */

scenario('J', '/send 502 时 user 消息已落库但无 assistant(行为快照)', async () => {
  const provider = new ScriptedProvider({
    routeFn: () => {
      throw new Error('forced provider failure');
    },
  });
  const app = await startTestApp({ provider });
  try {
    const { token } = await registerUser(app.baseUrl);
    const convId = await createOnboardingConv(app.baseUrl, token);
    const send = await httpJson<{ error?: unknown }>(
      app.baseUrl,
      'POST',
      '/api/chat/send',
      { token, body: { conversationId: convId, text: '我会被 orphan' } }
    );
    assertEq(send.status, 502, '/send 应 502');

    const msgs = await httpJson<{
      data: { role: string; content: string | null }[];
    }>(app.baseUrl, 'GET', `/api/chat/conversations/${convId}/messages`, {
      token,
    });
    const userMsgs = msgs.body.data.filter((m) => m.role === 'user');
    const assistantMsgs = msgs.body.data.filter((m) => m.role === 'assistant');
    assertEq(userMsgs.length, 1, 'user 消息已落库');
    assertEq(userMsgs[0].content, '我会被 orphan', 'user 消息内容');
    assertEq(assistantMsgs.length, 0, '无 assistant 消息(/send 502 前未创建)');
  } finally {
    await app.cleanup();
  }
});

/* ============================================================
 * Runner
 * ========================================================== */

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  console.log(`[smoke:onb] === ${scenarios.length} scenarios ===\n`);
  for (const sc of scenarios) {
    const t0 = Date.now();
    try {
      await sc.run();
      passed += 1;
      console.log(`[smoke:onb] ✓ ${sc.id} ${sc.title} (${Date.now() - t0}ms)`);
    } catch (e) {
      failed += 1;
      console.error(
        `[smoke:onb] ✗ ${sc.id} ${sc.title} (${Date.now() - t0}ms)`
      );
      console.error(`  → ${(e as Error).message}`);
      if ((e as Error).stack) {
        const stack = (e as Error).stack!.split('\n').slice(1, 4).join('\n');
        console.error(stack);
      }
    }
  }
  console.log('');
  if (failed > 0) {
    console.error(`[smoke:onb] FAILED ${failed} / ${scenarios.length}`);
    process.exit(1);
  }
  console.log(`[smoke:onb] PASSED ${passed} / ${scenarios.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke:onb] crash:', err);
  process.exit(1);
});
