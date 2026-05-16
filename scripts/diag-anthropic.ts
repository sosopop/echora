/**
 * 直接调用 AnthropicProvider 验证 route() 是否能通
 *
 * 用法:tsx scripts/diag-anthropic.ts
 */

import { getConfig } from '../server/config/getConfig.js';
import { createProvider } from '../server/ai/providers/index.js';

async function main(): Promise<void> {
  const config = getConfig({ reload: true });
  console.log('[diag] AI_PROVIDER =', config.aiProvider);
  console.log('[diag] ANTHROPIC_BASE_URL =', config.anthropicBaseURL);
  console.log('[diag] ANTHROPIC_MODEL =', config.anthropicModel);
  console.log(
    '[diag] ANTHROPIC_API_KEY =',
    config.anthropicApiKey ? `${config.anthropicApiKey.slice(0, 10)}...` : '(empty)'
  );

  const provider = createProvider(config);
  console.log('[diag] provider.name =', provider.name);

  console.log('\n[diag] route() 测试...');
  try {
    const decision = await provider.route({
      userText: 'hi',
      profile: null,
      currentLearningState: 'onboarding',
      conversationId: 1,
      availableSkills: [
        'onboarding',
        'scene-select',
        'practice',
        'grade',
        'explain',
        'review',
        'retry',
        'general-chat',
      ],
    });
    console.log('[diag] ✓ route 成功:', JSON.stringify(decision, null, 2));
  } catch (e) {
    console.error('[diag] ✗ route 失败:');
    console.error(e);
  }
}

main().catch((e) => {
  console.error('[diag] fatal', e);
  process.exit(1);
});
