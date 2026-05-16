/**
 * 可脚本化的 Mock AIProvider
 *
 * 用于 smoke:onboarding 等需要确定性 LLM 行为的场景测试。
 * - route():默认返 onboarding(高置信度);可注入自定义 routeFn
 * - chat():按 chatScripts 顺序匹配最后一条 user message 子串,产出预录的事件
 * - disableChat:不暴露 chat 字段(模拟 stub provider 不支持 chat 的路径)
 *
 * 与 server/__tests__/skill-onboarding.test.ts 中的简单 inline mock 类似,
 * 但更通用、可在 smoke 多场景间复用。
 */

import type {
  AIProvider,
  ChatRequest,
  ChatStreamEvent,
} from '../../../server/ai/types.js';
import type {
  RouterInput,
  RouterDecision,
} from '../../../shared/skill.js';

export interface ChatScript {
  /**
   * 匹配最后一条 user message 的 content 子串。
   * 空串 = 兜底默认(放在数组末尾时总会命中)。
   */
  match: string;
  /**
   * 当 match 命中时按顺序 yield 的事件序列。
   * 通常包含若干 text-delta + 0..N tool-use + 一个 message-stop。
   */
  events: ChatStreamEvent[];
  /**
   * 可选:每帧之间的延迟(ms)。用于测试 SSE 续传等场景。
   */
  delayMs?: number;
}

export interface ScriptedProviderOptions {
  /**
   * route() 决策函数。默认:onboarding 学习态返 skill="onboarding",
   * 其他态返 skill="general-chat",confidence=0.9。
   */
  routeFn?: (input: RouterInput) => RouterDecision | Promise<RouterDecision>;
  /**
   * chat 脚本列表。按数组顺序首个 match 子串命中的 script 生效。
   */
  chatScripts?: ChatScript[];
  /**
   * 设为 true 时不暴露 chat 字段(模拟 stub provider 不支持 chat 的路径)。
   */
  disableChat?: boolean;
  /**
   * 调试:每次 chat 调用时把入参打印到 console。
   */
  debugLog?: boolean;
}

export class ScriptedProvider implements AIProvider {
  readonly name = 'scripted';
  readonly chat?: (req: ChatRequest) => AsyncIterable<ChatStreamEvent>;
  private readonly options: ScriptedProviderOptions;

  constructor(options: ScriptedProviderOptions = {}) {
    this.options = options;
    if (!options.disableChat) {
      this.chat = (req) => this.chatImpl(req);
    }
  }

  async route(input: RouterInput): Promise<RouterDecision> {
    if (this.options.routeFn) {
      return await this.options.routeFn(input);
    }
    // 默认决策:onboarding 学习态选 onboarding,否则 general-chat
    if (
      input.currentLearningState === 'onboarding' &&
      input.availableSkills.includes('onboarding')
    ) {
      return {
        skillName: 'onboarding',
        params: {},
        confidence: 0.95,
        rationale: '[ScriptedProvider] onboarding 学习态默认选 onboarding skill',
      };
    }
    return {
      skillName: 'general-chat',
      params: {},
      confidence: 0.9,
      rationale: '[ScriptedProvider] 默认 general-chat',
    };
  }

  private async *chatImpl(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const lastUser = [...req.messages]
      .reverse()
      .find((m) => m.role === 'user');
    const lastUserText = lastUser?.content ?? '';

    if (this.options.debugLog) {
      console.log(
        `[ScriptedProvider.chat] last user="${lastUserText}" tools=${
          req.tools?.map((t) => t.name).join(',') ?? 'none'
        }`
      );
    }

    const scripts = this.options.chatScripts ?? [];
    const matched =
      scripts.find(
        (s) => s.match === '' || lastUserText.includes(s.match)
      ) ?? null;

    if (!matched) {
      // 没有匹配脚本时也产一条 message-stop,避免下游永等
      yield { type: 'message-stop', stopReason: 'no_script_matched' };
      return;
    }

    for (const ev of matched.events) {
      if (req.signal.aborted) return;
      if (matched.delayMs && matched.delayMs > 0) {
        await new Promise((r) => setTimeout(r, matched.delayMs));
      }
      yield ev;
    }
  }
}
