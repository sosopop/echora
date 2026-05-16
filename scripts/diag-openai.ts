/**
 * diag-openai:直接调 OpenAIProvider.route() 诊断 endpoint / token / 模型
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { OpenAIProvider } from '../server/ai/providers/openai.js';
import type { RouterInput } from '../shared/skill.js';

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[diag] OPENAI_API_KEY 未配置');
    process.exit(1);
  }
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  console.log('[diag] AI_PROVIDER     =', process.env.AI_PROVIDER ?? '(unset)');
  console.log('[diag] OPENAI_BASE_URL =', baseURL);
  console.log('[diag] OPENAI_MODEL    =', model);
  console.log('[diag] OPENAI_API_KEY  =', apiKey.slice(0, 10) + '...');
  console.log();

  const provider = new OpenAIProvider({ apiKey, baseURL, model });

  console.log('[diag] route() 测试...');
  const input: RouterInput = {
    userText: 'hi',
    profile: null,
    currentLearningState: 'onboarding',
    conversationId: 0,
    availableSkills: ['onboarding', 'general-chat'],
  };
  try {
    const d = await provider.route(input);
    console.log('[diag] ✓ route ok:', JSON.stringify(d));
  } catch (e) {
    console.error('[diag] ✗ route 失败:');
    console.error(e);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('[diag] crash:', e);
  process.exit(1);
});
