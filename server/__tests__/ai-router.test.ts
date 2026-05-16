/**
 * AI Router 测试 — 验证 fallback 已完全删除,失败抛错而非降级
 */

import { describe, it, expect } from '@jest/globals';
import { createAIRouter, RouterValidationError } from '../ai/router.js';
import { SkillRegistry } from '../skills/registry.js';
import type { AIProvider } from '../ai/types.js';
import type { Skill, RouterInput, RouterDecision } from '../../shared/skill.js';

function makeRegistry(skills: Skill[]): SkillRegistry {
  const reg = new SkillRegistry();
  for (const s of skills) reg.register(s);
  return reg;
}

const onboardingSkill: Skill = {
  name: 'onboarding',
  description: 'test onboarding',
  allowedStates: ['onboarding'],
  async *handler() {
    yield { type: 'done', payload: {} };
  },
};

const generalChatSkill: Skill = {
  name: 'general-chat',
  description: 'test general-chat',
  allowedStates: [],
  async *handler() {
    yield { type: 'done', payload: {} };
  },
};

const baseInput: RouterInput = {
  userText: 'hi',
  profile: null,
  currentLearningState: 'onboarding',
  conversationId: 1,
  availableSkills: ['onboarding', 'general-chat'],
};

describe('createAIRouter — 无 fallback', () => {
  it('正常路径返回 provider decision', async () => {
    const provider: AIProvider = {
      name: 'mock',
      async route() {
        return {
          skillName: 'onboarding',
          params: {},
          confidence: 0.9,
          rationale: 'ok',
        };
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry);
    const d = await router.decide(baseInput);
    expect(d.skillName).toBe('onboarding');
    expect(d.confidence).toBe(0.9);
  });

  it('provider.route 抛错时,decide 直接抛错(不 fallback)', async () => {
    const provider: AIProvider = {
      name: 'mock',
      async route(): Promise<RouterDecision> {
        throw new Error('upstream 401');
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry);
    await expect(router.decide(baseInput)).rejects.toThrow('upstream 401');
  });

  it('skillName 不在 registry → 抛 RouterValidationError(skill_not_found)', async () => {
    const provider: AIProvider = {
      name: 'mock',
      async route() {
        return {
          skillName: 'nonexistent',
          params: {},
          confidence: 0.9,
          rationale: 'ok',
        };
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry);
    await expect(router.decide(baseInput)).rejects.toBeInstanceOf(
      RouterValidationError
    );
    try {
      await router.decide(baseInput);
    } catch (e) {
      expect((e as RouterValidationError).reason).toBe('skill_not_found');
    }
  });

  it('当前 state 不在 allowedStates → 抛 RouterValidationError(state_not_allowed)', async () => {
    const provider: AIProvider = {
      name: 'mock',
      async route() {
        return {
          skillName: 'onboarding',
          params: {},
          confidence: 0.9,
          rationale: 'ok',
        };
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry);
    await expect(
      router.decide({ ...baseInput, currentLearningState: 'practicing' })
    ).rejects.toBeInstanceOf(RouterValidationError);
  });

  it('空 allowedStates 视为任意态可用', async () => {
    const provider: AIProvider = {
      name: 'mock',
      async route() {
        return {
          skillName: 'general-chat',
          params: {},
          confidence: 0.5,
          rationale: 'any state ok',
        };
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry);
    const d = await router.decide({
      ...baseInput,
      currentLearningState: 'practicing',
    });
    expect(d.skillName).toBe('general-chat');
  });
});
