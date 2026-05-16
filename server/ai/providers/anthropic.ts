/**
 * Anthropic Provider — 骨架(V1 不实现真实调用)
 *
 * TODO V1.x:接入 @anthropic-ai/sdk 的 messages.create 流式 API,
 *           实现 RouterDecision JSON 模式输出与 complete 流。
 *
 * 当前状态:构造校验 apiKey 非空;route / complete 抛 NotImplementedError。
 * 这样可以让 createProvider 按 config.aiProvider 实例化但不会误访问 API。
 */

import type { AIProvider } from '../types.js';
import type { RouterInput, RouterDecision } from '../../../shared/skill.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  // private readonly model: string;

  constructor(opts: AnthropicProviderOptions) {
    if (!opts.apiKey || opts.apiKey.trim() === '') {
      throw new Error('AnthropicProvider 需要非空 apiKey');
    }
    this.apiKey = opts.apiKey;
    // this.model = opts.model ?? 'claude-sonnet-4-6';
  }

  async route(_input: RouterInput): Promise<RouterDecision> {
    void this.apiKey; // suppress unused warning
    throw new Error(
      'AnthropicProvider.route() 在 V1 未实现。请将 AI_PROVIDER 设为 stub。'
    );
  }

  async *complete(_prompt: string, _signal: AbortSignal): AsyncIterable<string> {
    throw new Error(
      'AnthropicProvider.complete() 在 V1 未实现。请将 AI_PROVIDER 设为 stub。'
    );
  }
}
