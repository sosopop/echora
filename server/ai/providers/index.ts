/**
 * Provider 工厂
 *
 * 根据 config.aiProvider 选择实现。
 * **不做 fallback**:配 anthropic/openai 但缺 key 时直接抛错,
 * 让问题立即暴露而不是悄悄降级到 stub。
 */

import type { AIProvider } from '../types.js';
import type { Config } from '../../config/getConfig.js';
import { StubProvider } from './stub.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export function createProvider(config: Config): AIProvider {
  if (config.aiProvider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error(
        'createProvider: AI_PROVIDER=anthropic 但 ANTHROPIC_API_KEY 未设置。请在 .env 中配置或改 AI_PROVIDER=stub'
      );
    }
    return new AnthropicProvider({
      apiKey: config.anthropicApiKey,
      baseURL: config.anthropicBaseURL,
      model: config.anthropicModel,
    });
  }
  if (config.aiProvider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error(
        'createProvider: AI_PROVIDER=openai 但 OPENAI_API_KEY 未设置。请在 .env 中配置或改 AI_PROVIDER=stub'
      );
    }
    return new OpenAIProvider({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseURL,
      model: config.openaiModel,
    });
  }
  return new StubProvider();
}
