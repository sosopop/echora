/**
 * 端到端冒烟脚本
 *
 * 流程:
 *   1. 临时 DB → migrate
 *   2. 装配 app,listen 随机端口
 *   3. fetch register → login
 *   4. fetch chat/send 拿 streamId
 *   5. fetch chat/stream 用 ReadableStream 解析 SSE,断言收到 text-chunk + done
 *   6. 清理 → exit 0
 *
 * 失败时 exit 1。
 */

import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { connect, closeDb } from '../../server/db/connect.js';
import { migrate } from '../../server/db/migrate.js';
import { registerAllSkills } from '../../server/skills/registry.js';
import { createProvider } from '../../server/ai/providers/index.js';
import { createAIRouter } from '../../server/ai/router.js';
import { createApp } from '../../server/createApp.js';
import type { Server } from 'node:http';

interface SmokeStep {
  name: string;
  run: () => Promise<void>;
}

async function main(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-smoke-'));
  const dbPath = path.join(tmpDir, 'smoke.db');
  const db = connect(dbPath);
  migrate(db);

  const skillRegistry = await registerAllSkills();
  const config = {
    port: 0,
    databasePath: dbPath,
    jwtSecret: 'smoke-secret',
    aiProvider: 'stub' as const,
    anthropicApiKey: null,
    anthropicBaseURL: 'https://api.anthropic.com',
    anthropicModel: 'claude-sonnet-4-6',
    openaiApiKey: null,
    openaiBaseURL: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o-mini',
    corsOrigin: ['http://localhost'],
    nodeEnv: 'test',
  };
  const provider = createProvider(config);
  const aiRouter = createAIRouter(provider, skillRegistry);
  const app = createApp({ config, db, skillRegistry, aiRouter, provider });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('无法获取测试端口');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`[smoke] 服务已启动 ${baseUrl}`);

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
          )}&lastSeq=0&token=${encodeURIComponent(token!)}`,
          {
            headers: { Accept: 'text/event-stream' },
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
        const deadline = Date.now() + 5000;

        while (Date.now() < deadline && !(sawTextChunk && sawDone)) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // 按 \n\n 切分 SSE event
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const dataLine = part
              .split('\n')
              .find((l) => l.startsWith('data: '));
            if (!dataLine) continue;
            const json = dataLine.substring('data: '.length);
            try {
              const evt = JSON.parse(json) as { type: string };
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
            `未收到完整事件流 (text-chunk=${sawTextChunk}, done=${sawDone})`
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

  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb(db);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 锁 */
  }

  if (failed > 0) {
    console.error(`[smoke] FAILED ${failed}/${steps.length}`);
    process.exit(1);
  }
  console.log(`[smoke] PASSED ${steps.length}/${steps.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke] 致命错误', err);
  process.exit(1);
});
