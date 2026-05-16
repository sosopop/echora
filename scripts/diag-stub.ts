/**
 * diag stub:验证 StubProvider 工作(无外网调用)
 */

import { resetConfigCache, getConfig } from '../server/config/getConfig.js';
import { createProvider } from '../server/ai/providers/index.js';

process.env.AI_PROVIDER = 'stub';
resetConfigCache();
const config = getConfig({ reload: true });
console.log('AI_PROVIDER override =', config.aiProvider);
const p = createProvider(config);
console.log('provider.name =', p.name);
const d = await p.route({
  userText: 'hi',
  profile: null,
  currentLearningState: 'onboarding',
  conversationId: 1,
  availableSkills: ['onboarding', 'general-chat'],
});
console.log('stub route decision:', JSON.stringify(d));
