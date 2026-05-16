/**
 * onboarding Skill — 画像收集(stub)
 *
 * 真实业务后续接入:对话式提取 name / age / grade / level,
 * 写入 user_profiles。本 stub 仅产文本流引导。
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const onboardingSkill: Skill = {
  name: SKILL_NAMES.onboarding,
  description: '对话式收集用户画像(stub)',
  allowedStates: ['onboarding'],
  async *handler(ctx) {
    yield {
      type: 'text-chunk',
      payload: { text: '你好!我是 Echo,你的英语对话教练 👋' },
    };
    yield {
      type: 'text-chunk',
      payload: {
        text: '先认识下你 — 怎么称呼你?顺便告诉我你的年级和当前的英语水平,我好挑合适的场景。',
      },
    };
    yield { type: 'done', payload: {} };
  },
};
