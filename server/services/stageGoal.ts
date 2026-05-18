/**
 * 练习主线阶段题量计划。
 *
 * PRD §2.6:整场 5-10 个计分题;阶段 1-2 默认各 1-3 题,
 * 阶段 3-4 默认各 1-2 题。
 */

import type { CefrLevel } from '../../shared/api.js';
import type { Db } from '../db/connect.js';
import { getProfile } from './profile.js';

export const MAX_MAINLINE_STAGE = 4;
export const LEGACY_STAGE_GOAL = 2;

export type StageGoalPlan = Record<number, number>;

export const DEFAULT_STAGE_GOAL_PLAN: StageGoalPlan = {
  1: 2,
  2: 2,
  3: 2,
  4: 2,
};

const STAGE_GOALS_BY_LEVEL: Record<CefrLevel, StageGoalPlan> = {
  A1: { 1: 2, 2: 1, 3: 1, 4: 1 },
  A2: { 1: 2, 2: 1, 3: 1, 4: 1 },
  B1: DEFAULT_STAGE_GOAL_PLAN,
  B2: DEFAULT_STAGE_GOAL_PLAN,
  C1: { 1: 3, 2: 3, 3: 2, 4: 2 },
  C2: { 1: 3, 2: 3, 3: 2, 4: 2 },
};

export function getStageGoalPlan(level?: CefrLevel | string | null): StageGoalPlan {
  const normalized =
    level && Object.prototype.hasOwnProperty.call(STAGE_GOALS_BY_LEVEL, level)
      ? (level as CefrLevel)
      : 'B1';
  return STAGE_GOALS_BY_LEVEL[normalized] ?? DEFAULT_STAGE_GOAL_PLAN;
}

export function getUserStageGoalPlan(db: Db, userId: number): StageGoalPlan {
  return getStageGoalPlan(getProfile(db, userId)?.level);
}

export function getStageGoal(
  db: Db,
  userId: number,
  stage: number
): number {
  return getStageGoalFromPlan(getUserStageGoalPlan(db, userId), stage);
}

export function getStageGoalFromPlan(
  plan: StageGoalPlan,
  stage: number
): number {
  return plan[stage] ?? LEGACY_STAGE_GOAL;
}

export function getTotalStageGoal(plan: StageGoalPlan): number {
  return Object.values(plan).reduce((sum, goal) => sum + goal, 0);
}
