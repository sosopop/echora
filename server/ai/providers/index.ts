/**
 * Provider 工厂
 *
 * 根据 config.aiProvider 选择实现。
 * anthropic 但缺 key 时降级到 stub 并 warn。
 */

import type { AIProvider } from '../types.js';
import type { Config } from '../../config/getConfig.js';
import { StubProvider } from './stub.js';
import { AnthropicProvider } from './anthropic.js';

export function createProvider(config: Config): AIProvider {
  if (config.aiProvider === 'anthropic') {
    if (!config.anthropicApiKey) {
      console.warn(
        '[createProvider] AI_PROVIDER=anthropic 但缺 ANTHROPIC_API_KEY,降级到 stub'
      );
      return new StubProvider();
    }
    return new AnthropicProvider({
      apiKey: config.anthropicApiKey,
      baseURL: config.anthropicBaseURL,
      model: config.anthropicModel,
    });
  }
  return new StubProvider();
}
