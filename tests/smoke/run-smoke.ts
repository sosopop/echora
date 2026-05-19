/**
 * 端到端冒烟脚本(确定性 provider)
 *
 * 流程:
 *   1. startTestApp(scripted provider)→ 临时 DB + 随机端口
 *   2. fetch register
 *   3. fetch profile CRUD
 *   4. fetch /me 验证 onboardingCompleted
 *   5. fetch chat/send 拿 streamId
 *   6. fetch chat/stream 用 ReadableStream 解析 SSE,断言收到 text-chunk + done
 *   7. 清理 → exit 0
 *
 * 失败时 exit 1。
 */

import { setTimeout as delay } from 'node:timers/promises';
import { startTestApp } from './_helpers/testApp.js';
import { ScriptedProvider } from './_helpers/scriptedProvider.js';

interface SmokeStep {
  name: string;
  run: () => Promise<void>;
}

async function main(): Promise<void> {
  const app = await startTestApp({
    tmpPrefix: 'echora-smoke-',
    provider: new ScriptedProvider({
      chatScripts: [
        {
          toolName: 'propose_scenes',
          match: '',
          events: [
            {
              type: 'tool-use',
              toolName: 'propose_scenes',
              input: {
                scenes: [
                  { id: 'cafe', topic: 'cafe order', title: '咖啡点单', description: '点饮品/打包', knowledgePoint: '礼貌请求', difficulty: 'B1' },
                  { id: 'travel', topic: 'travel help', title: '旅行问路', description: '问方向', knowledgePoint: '介词', difficulty: 'B1' },
                  { id: 'school', topic: 'school chat', title: '校园对话', description: '同学交流', knowledgePoint: '一般疑问句', difficulty: 'B1' },
                  { id: 'shop', topic: 'shopping basics', title: '商场购物', description: '问价格/换尺码', knowledgePoint: '比较级', difficulty: 'B1' },
                  { id: 'doctor', topic: 'doctor visit', title: '看病问诊', description: '描述症状', knowledgePoint: '身体表达', difficulty: 'B1' },
                  { id: 'office', topic: 'office meeting', title: '办公室会议', description: '确认任务', knowledgePoint: '工作协作', difficulty: 'B1' },
                  { id: 'movie', topic: 'movie plan', title: '看电影约票', description: '约朋友看电影', knowledgePoint: '邀请表达', difficulty: 'B1' },
                  { id: 'hotel', topic: 'hotel check-in', title: '酒店入住', description: '办理入住', knowledgePoint: '基础问答', difficulty: 'B1' },
                ],
              },
            },
            { type: 'message-stop', stopReason: 'tool_use' },
          ],
        },
        {
          match: '',
          events: [
            { type: 'text-delta', text: '在的。我们可以继续练英语。' },
            { type: 'message-stop', stopReason: 'end_turn' },
          ],
        },
      ],
    }),
  });
  console.log(`[smoke] 服务已启动 ${app.baseUrl}`);
  const { baseUrl } = app;

  let token: string | null = null;
  let streamId: string | null = null;

  const steps: SmokeStep[] = [
    {
      name: 'register',
      async run() {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `smoke-${Date.now()}@echora.dev`,
            password: 'smoke-pwd-12345',
          }),
        });
        const body = (await res.json()) as { data?: { token: string } };
        if (res.status !== 201 || !body.data?.token) {
          throw new Error(`register 失败 ${res.status}: ${JSON.stringify(body)}`);
        }
        token = body.data.token;
      },
    },
    {
      name: 'profile-empty',
      async run() {
        const res = await fetch(`${baseUrl}/api/profile`, {
          headers: { Authorization: `Bearer ${token!}` },
        });
        const body = (await res.json()) as {
          data?: { name: string | null; level: string | null };
        };
        if (res.status !== 200) {
          throw new Error(`GET /profile 失败 ${res.status}`);
        }
        if (body.data?.name !== null || body.data?.level !== null) {
          throw new Error(
            `空 profile 不空: ${JSON.stringify(body.data)}`
          );
        }
      },
    },
    {
      name: 'profile-update',
      async run() {
        const res = await fetch(`${baseUrl}/api/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token!}`,
          },
          body: JSON.stringify({ name: '冒烟用户', level: 'B1' }),
        });
        const body = (await res.json()) as {
          data?: { name: string; level: string };
        };
        if (res.status !== 200) {
          throw new Error(`PUT /profile 失败 ${res.status}`);
        }
        if (body.data?.name !== '冒烟用户' || body.data?.level !== 'B1') {
          throw new Error(
            `PUT /profile 写入未生效: ${JSON.stringify(body.data)}`
          );
        }
      },
    },
    {
      name: 'me-onboarding-completed',
      async run() {
        const res = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token!}` },
        });
        const body = (await res.json()) as {
          data?: { onboardingCompleted: boolean };
        };
        if (res.status !== 200 || body.data?.onboardingCompleted !== true) {
          throw new Error(
            `/me 未返 onboardingCompleted=true: ${JSON.stringify(body.data)}`
          );
        }
      },
    },
    {
      name: 'send',
      async run() {
        const res = await fetch(`${baseUrl}/api/chat/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token!}`,
          },
          body: JSON.stringify({ text: 'hi from smoke test' }),
        });
        const body = (await res.json()) as {
          data?: { streamId: string };
          error?: unknown;
        };
        if (res.status !== 202 || !body.data?.streamId) {
          throw new Error(`send 失败 ${res.status}: ${JSON.stringify(body)}`);
        }
        streamId = body.data.streamId;
      },
    },
    {
      name: 'stream',
      async run() {
        // 给后台任务一点时间产事件并落入 ring buffer
        await delay(120);
        const res = await fetch(
          `${baseUrl}/api/chat/stream?streamId=${encodeURIComponent(
            streamId!
          )}`,
          {
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${token!}`,
            },
          }
        );
        if (res.status !== 200 || !res.body) {
          throw new Error(`stream 失败 ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let sawTextChunk = false;
        let sawDone = false;
        const seenTypes: string[] = [];
        const deadline = Date.now() + 5000;

        while (Date.now() < deadline && !(sawTextChunk && sawDone)) {
          const remaining = deadline - Date.now();
          const result = await Promise.race([
            reader.read(),
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
          if (!done) {
            buf += decoder.decode(value, { stream: true });
          }
          const consumed = drainSseBuffer(buf, (evt) => {
            seenTypes.push(evt.type);
            if (evt.type === 'text-chunk') sawTextChunk = true;
            if (evt.type === 'done') sawDone = true;
          });
          buf = consumed.rest;
          if (done) {
            break;
          }
        }

        if (buf.trim().length > 0) {
          const consumed = drainSseBuffer(buf, (evt) => {
            seenTypes.push(evt.type);
            if (evt.type === 'text-chunk') sawTextChunk = true;
            if (evt.type === 'done') sawDone = true;
          });
          buf = consumed.rest;
          if (buf.trim().length > 0) {
            try {
              const evt = JSON.parse(buf.replace(/^data:\s*/, '')) as { type: string };
              seenTypes.push(evt.type);
              if (evt.type === 'text-chunk') sawTextChunk = true;
              if (evt.type === 'done') sawDone = true;
            } catch {
              /* ignore */
            }
          }
        }

        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }

        if (!sawTextChunk || !sawDone) {
          throw new Error(
            `未收到完整事件流 (text-chunk=${sawTextChunk}, done=${sawDone}, seen=${seenTypes.join(',')})`
          );
        }
      },
    },
  ];

  let failed = 0;
  for (const step of steps) {
    const t0 = Date.now();
    try {
      await step.run();
      console.log(`[smoke] ✓ ${step.name} (${Date.now() - t0}ms)`);
    } catch (e) {
      failed += 1;
      console.error(`[smoke] ✗ ${step.name}:`, (e as Error).message);
    }
  }

  await app.cleanup();

  if (failed > 0) {
    console.error(`[smoke] FAILED ${failed}/${steps.length}`);
    process.exit(1);
  }
  console.log(`[smoke] PASSED ${steps.length}/${steps.length}`);
  process.exit(0);
}

function drainSseBuffer(
  buf: string,
  onEvent: (evt: { type: string }) => void
): { rest: string } {
  const parts = buf.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const dataLine = part
      .split('\n')
      .find((l) => l.startsWith('data: '));
    if (!dataLine) continue;
    const json = dataLine.substring('data: '.length);
    try {
      onEvent(JSON.parse(json) as { type: string });
    } catch {
      /* ignore */
    }
  }
  return { rest };
}

main().catch((err) => {
  console.error('[smoke] 致命错误', err);
  process.exit(1);
});
