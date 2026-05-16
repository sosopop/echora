/**
 * AI Provider 抽象
 */

import type { RouterInput, RouterDecision } from '../../shared/skill.js';

export interface AIProvider {
  readonly name: string;

  /**
   * 路由决策:根据用户输入与上下文,选择 Skill 并给出参数。
   */
  route(input: RouterInput): Promise<RouterDecision>;

  /**
   * 通用文本流式补全(可选,Skill 内部需要时调用)。
   * Stub Provider 不实现。
   */
  complete?(prompt: string, signal: AbortSignal): AsyncIterable<string>;
}
