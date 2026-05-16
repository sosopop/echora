/**
 * AI Router
 *
 * 流程:
 *   1. provider.route() 拿初始 decision
 *   2. 校验 skillName 在 registry 中存在
 *   3. 校验当前 learningState ∈ skill.allowedStates(空数组视为任意态)
 *   4. 任一校验失败 → 降级到 general-chat
 *
 * 不直接落 agent_runs,日志由调用方(chat 路由)负责。
 */

import type { AIProvider } from './types.js';
import type {
  RouterInput,
  RouterDecision,
  LearningState,
} from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { SkillRegistry } from '../skills/registry.js';

export interface AIRouter {
  decide(input: RouterInput): Promise<RouterDecision>;
}

export function createAIRouter(
  provider: AIProvider,
  registry: SkillRegistry
): AIRouter {
  return {
    async decide(input: RouterInput): Promise<RouterDecision> {
      let decision: RouterDecision;
      try {
        decision = await provider.route(input);
      } catch (err) {
        console.warn(
          `[AIRouter] provider.route 失败,降级到 general-chat:`,
          (err as Error).message
        );
        return fallbackDecision('provider_error');
      }

      const skill = registry.get(decision.skillName);
      if (!skill) {
        console.warn(
          `[AIRouter] Skill 不存在: ${decision.skillName},降级到 general-chat`
        );
        return fallbackDecision('skill_not_found');
      }

      if (!isStateAllowed(skill.allowedStates, input.currentLearningState)) {
        console.warn(
          `[AIRouter] Skill ${decision.skillName} 不允许在状态 ${input.currentLearningState},降级到 general-chat`
        );
        return fallbackDecision('state_not_allowed');
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

function fallbackDecision(reason: string): RouterDecision {
  return {
    skillName: SKILL_NAMES.generalChat,
    params: {},
    confidence: 0.3,
    rationale: `router fallback (${reason})`,
  };
}
