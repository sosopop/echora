/**
 * 聚合导出 8 个 Skill stub。
 * 由 server/skills/registry.ts 的 registerAllSkills 消费。
 */

import type { Skill } from '../../shared/skill.js';
import { onboardingSkill } from './onboarding.js';
import { sceneSelectSkill } from './sceneSelect.js';
import { practiceSkill } from './practice.js';
import { gradeSkill } from './grade.js';
import { explainSkill } from './explain.js';
import { reviewSkill } from './review.js';
import { retrySkill } from './retry.js';
import { generalChatSkill } from './generalChat.js';

export const allSkills: Skill[] = [
  onboardingSkill,
  sceneSelectSkill,
  practiceSkill,
  gradeSkill,
  explainSkill,
  reviewSkill,
  retrySkill,
  generalChatSkill,
];

export {
  onboardingSkill,
  sceneSelectSkill,
  practiceSkill,
  gradeSkill,
  explainSkill,
  reviewSkill,
  retrySkill,
  generalChatSkill,
};
