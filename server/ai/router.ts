/**
 * AI Router
 *
 * 流程:
 *   1. provider.route() 拿初始 decision(失败直接抛错)
 *   2. 校验 skillName 在 registry 中存在(失败抛 RouterValidationError)
 *   3. 校验当前 learningState ∈ skill.allowedStates(空数组视为任意态;失败抛 RouterValidationError)
 *
 * **不做 fallback**:任一步失败直接抛错,由上层(chat.ts 背景任务)catch 并
 * 转成 SkillEvent error 推给前端。问题暴露而不是悄悄降级。
 *
 * 不直接落 agent_runs,日志由调用方(chat 路由)负责。
 */

import type { AIProvider } from './types.js';
import type {
  RouterInput,
  RouterDecision,
  LearningState,
} from '../../shared/skill.js';
import type { SkillRegistry } from '../skills/registry.js';
import type { DebugContext } from './types.js';
import { debugFromContext, sanitizeForDebugLog } from '../utils/debugLog.js';
import type { DebugLogger } from '../utils/debugLog.js';

export interface AIRouter {
  decide(
    input: RouterInput,
    signal?: AbortSignal,
    debug?: DebugContext
  ): Promise<RouterDecision>;
}

export class RouterValidationError extends Error {
  constructor(
    public readonly reason: 'skill_not_found' | 'state_not_allowed',
    message: string
  ) {
    super(message);
    this.name = 'RouterValidationError';
  }
}

export function createAIRouter(
  provider: AIProvider,
  registry: SkillRegistry,
  logDebug?: DebugLogger
): AIRouter {
  return {
    async decide(
      input: RouterInput,
      signal?: AbortSignal,
      debug?: DebugContext
    ): Promise<RouterDecision> {
      throwIfAborted(signal);
      // provider.route() 失败直接传播,不 catch
      const startedAt = Date.now();
      const context = debugFromContext(debug);
      logDebug?.({
        level: 'debug',
        type: 'ai_provider_route_input',
        ...context,
        provider: provider.name,
        input: sanitizeForDebugLog(input),
      });
      let decision: RouterDecision;
      try {
        decision = await provider.route(input, signal, debug);
      } catch (e) {
        logDebug?.({
          level: 'error',
          type: 'ai_provider_route_error',
          ...context,
          provider: provider.name,
          durationMs: Date.now() - startedAt,
          error: sanitizeForDebugLog(e),
        });
        throw e;
      }
      throwIfAborted(signal);

      const skill = registry.get(decision.skillName);
      if (!skill) {
        throw new RouterValidationError(
          'skill_not_found',
          `AI 选择的 Skill 不存在: ${decision.skillName}`
        );
      }

      if (!isStateAllowed(skill.allowedStates, input.currentLearningState)) {
        throw new RouterValidationError(
          'state_not_allowed',
          `Skill ${decision.skillName} 不允许在学习态 ${input.currentLearningState}(允许:${skill.allowedStates.join(', ') || '任意'})`
        );
      }

      logDebug?.({
        level: 'debug',
        type: 'ai_provider_route_output',
        ...context,
        provider: provider.name,
        durationMs: Date.now() - startedAt,
        decision: sanitizeForDebugLog(decision),
      });
      return decision;
    },
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}

function isStateAllowed(
  allowed: LearningState[],
  current: LearningState
): boolean {
  if (allowed.length === 0) return true; // 任意态可用
  return allowed.includes(current);
}
