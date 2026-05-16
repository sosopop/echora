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

export interface AIRouter {
  decide(input: RouterInput): Promise<RouterDecision>;
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
  registry: SkillRegistry
): AIRouter {
  return {
    async decide(input: RouterInput): Promise<RouterDecision> {
      // provider.route() 失败直接传播,不 catch
      const decision = await provider.route(input);

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

      return decision;
    },
  };
}

function isStateAllowed(
  allowed: LearningState[],
  current: LearningState
): boolean {
  if (allowed.length === 0) return true; // 任意态可用
  return allowed.includes(current);
}
