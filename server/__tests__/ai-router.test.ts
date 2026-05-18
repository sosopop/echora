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
  it('记录 provider route 输入输出日志', async () => {
    const entries: Array<Record<string, unknown>> = [];
    const provider: AIProvider = {
      name: 'mock',
      async route() {
        return {
          skillName: 'onboarding',
          params: { foo: 'bar' },
          confidence: 0.9,
          rationale: 'ok',
        };
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry, (entry) => {
      entries.push(entry);
    });

    await router.decide(baseInput, undefined, {
      traceId: 'trace-ai-router',
      userId: 7,
      conversationId: 8,
      messageId: 9,
      phase: 'unit-test',
    });

    expect(entries.map((e) => e.type)).toEqual([
      'ai_provider_route_input',
      'ai_provider_route_output',
    ]);
    expect(entries[0]).toMatchObject({
      traceId: 'trace-ai-router',
      userId: 7,
      conversationId: 8,
      messageId: 9,
      provider: 'mock',
      phase: 'unit-test',
    });
    expect(entries[1]).toMatchObject({
      decision: {
        skillName: 'onboarding',
        params: { foo: 'bar' },
      },
    });
  });

  it('正常路径返回 provider decision', async () => {
    const ctrl = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    const provider: AIProvider = {
      name: 'mock',
      async route(_input, signal) {
        capturedSignal = signal;
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
    const d = await router.decide(baseInput, ctrl.signal);
    expect(d.skillName).toBe('onboarding');
    expect(d.confidence).toBe(0.9);
    expect(capturedSignal).toBe(ctrl.signal);
  });

  it('signal 已取消时不调用 provider.route', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let called = false;
    const provider: AIProvider = {
      name: 'mock',
      async route() {
        called = true;
        return {
          skillName: 'onboarding',
          params: {},
          confidence: 0.9,
          rationale: 'should not run',
        };
      },
    };
    const registry = makeRegistry([onboardingSkill, generalChatSkill]);
    const router = createAIRouter(provider, registry);
    await expect(router.decide(baseInput, ctrl.signal)).rejects.toThrow(
      'Aborted'
    );
    expect(called).toBe(false);
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
