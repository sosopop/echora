/**
 * AI Provider 双 Provider 真实接入烟雾测试
 *
 * **严格模式**:任一 Provider API key 未配置即报错退出。
 * 若你只想跑其中一个,可临时把另一个置空 + 注释掉 RUN_OPENAI / RUN_ANTHROPIC。
 *
 * 不依赖 server 启动,直接 import provider 类调:
 *   1. provider.route() — 给 onboarding 学习态 + ["onboarding","general-chat"] 选项,
 *      期望返回 onboarding skillName + confidence > 0
 *   2. provider.chat() — system 提示「用 update_profile 工具记录用户姓名」+
 *      user message「我叫张三」,期望流中出现至少一个 text-delta + 一个 tool-use
 *
 * 输出格式:每步 ✓/✗,最后总数。
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { AnthropicProvider } from '../../server/ai/providers/anthropic.js';
import { OpenAIProvider } from '../../server/ai/providers/openai.js';
import type {
  AIProvider,
  ChatStreamEvent,
  ToolDef,
} from '../../server/ai/types.js';
import type { RouterInput } from '../../shared/skill.js';

const RUN_ANTHROPIC = true;
const RUN_OPENAI = true;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`环境变量 ${name} 未配置`);
  }
  return v;
}

/**
 * 严格模式预检:在跑任何 provider 测试前,把所有需要的 env 都检查一遍,
 * 哪一个缺都立即报错。避免一边跑一边发现缺,Anthropic 的输出被 OpenAI 的 exit 截断。
 */
function preflight(): void {
  const missing: string[] = [];
  if (RUN_ANTHROPIC) {
    if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  }
  if (RUN_OPENAI) {
    if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  }
  if (missing.length > 0) {
    console.error('[smoke:ai] ✗ 严格模式:缺以下环境变量,无法进行 AI provider 测试');
    for (const m of missing) console.error(`[smoke:ai]   - ${m}`);
    console.error(
      '[smoke:ai] 提示:在 .env 中配置 ANTHROPIC_API_KEY / OPENAI_API_KEY,或临时把对应的 RUN_* 改为 false 跳过'
    );
    process.exit(1);
  }
}

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

const updateProfileTool: ToolDef = {
  name: 'update_profile',
  description: '记录用户姓名',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '用户姓名' },
    },
    required: ['name'],
    additionalProperties: false,
  },
};

const routerInput: RouterInput = {
  userText: '我想开始练习',
  profile: null,
  currentLearningState: 'onboarding',
  conversationId: 0,
  availableSkills: ['onboarding', 'general-chat'],
};

async function testRoute(
  provider: AIProvider,
  label: string
): Promise<StepResult> {
  try {
    const d = await provider.route(routerInput);
    if (!d.skillName) {
      return {
        step: `${label}/route`,
        ok: false,
        detail: 'decision.skillName 为空',
      };
    }
    if (typeof d.confidence !== 'number' || d.confidence < 0 || d.confidence > 1) {
      return {
        step: `${label}/route`,
        ok: false,
        detail: `confidence 不合法: ${d.confidence}`,
      };
    }
    return {
      step: `${label}/route`,
      ok: true,
      detail: `skillName=${d.skillName} confidence=${d.confidence.toFixed(2)}`,
    };
  } catch (e) {
    return {
      step: `${label}/route`,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function testChat(
  provider: AIProvider,
  label: string
): Promise<StepResult> {
  if (!provider.chat) {
    return {
      step: `${label}/chat`,
      ok: false,
      detail: 'provider.chat 未实现',
    };
  }
  const ac = new AbortController();
  let textDeltaCount = 0;
  let toolUseCount = 0;
  let toolName = '';
  let toolInput: Record<string, unknown> = {};
  let messageStop = false;
  try {
    const stream = provider.chat({
      system:
        '你是测试助手。当用户提供姓名时,必须调用 update_profile 工具记录。然后用一句中文确认收到。',
      messages: [{ role: 'user', content: '你好,我叫张三。' }],
      tools: [updateProfileTool],
      toolChoice: 'auto',
      maxTokens: 256,
      signal: ac.signal,
    });
    for await (const ev of stream as AsyncIterable<ChatStreamEvent>) {
      if (ev.type === 'text-delta') textDeltaCount++;
      else if (ev.type === 'tool-use') {
        toolUseCount++;
        toolName = ev.toolName;
        toolInput = ev.input;
      } else if (ev.type === 'message-stop') messageStop = true;
    }
  } catch (e) {
    return {
      step: `${label}/chat`,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  if (!messageStop) {
    return {
      step: `${label}/chat`,
      ok: false,
      detail: '未收到 message-stop 事件',
    };
  }
  if (toolUseCount === 0) {
    return {
      step: `${label}/chat`,
      ok: false,
      detail: `未触发 tool-use(textDelta=${textDeltaCount},模型可能未理解工具用法)`,
    };
  }
  if (toolName !== 'update_profile') {
    return {
      step: `${label}/chat`,
      ok: false,
      detail: `tool-use 名称错误: ${toolName}`,
    };
  }
  return {
    step: `${label}/chat`,
    ok: true,
    detail: `textDelta=${textDeltaCount} toolUse=${toolUseCount} input=${JSON.stringify(toolInput)}`,
  };
}

async function runAnthropic(): Promise<StepResult[]> {
  console.log('[smoke:ai] === Anthropic Provider ===');
  const apiKey = requireEnv('ANTHROPIC_API_KEY');
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  const model = process.env.ANTHROPIC_MODEL || undefined;
  console.log(
    `[smoke:ai]   baseURL=${baseURL ?? 'default'} model=${model ?? 'default'}`
  );
  const provider = new AnthropicProvider({ apiKey, baseURL, model });
  const results: StepResult[] = [];
  results.push(await testRoute(provider, 'anthropic'));
  results.push(await testChat(provider, 'anthropic'));
  return results;
}

async function runOpenAI(): Promise<StepResult[]> {
  console.log('[smoke:ai] === OpenAI Provider ===');
  const apiKey = requireEnv('OPENAI_API_KEY');
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  const model = process.env.OPENAI_MODEL || undefined;
  console.log(
    `[smoke:ai]   baseURL=${baseURL ?? 'default'} model=${model ?? 'default'}`
  );
  const provider = new OpenAIProvider({ apiKey, baseURL, model });
  const results: StepResult[] = [];
  results.push(await testRoute(provider, 'openai'));
  results.push(await testChat(provider, 'openai'));
  return results;
}

async function main(): Promise<void> {
  preflight();
  const all: StepResult[] = [];
  if (RUN_ANTHROPIC) all.push(...(await runAnthropic()));
  if (RUN_OPENAI) all.push(...(await runOpenAI()));

  console.log('');
  console.log('[smoke:ai] === Results ===');
  for (const r of all) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`[smoke:ai] ${mark} ${r.step}: ${r.detail}`);
  }
  const passed = all.filter((r) => r.ok).length;
  console.log(`[smoke:ai] PASSED ${passed}/${all.length}`);
  if (passed !== all.length) process.exit(1);
}

main().catch((e) => {
  console.error('[smoke:ai] crash:', e);
  process.exit(1);
});
