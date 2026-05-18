/**
 * 自动难度调节(PRD §2.6)
 *
 * 规则:
 * - 连续 2 个已完成场景全主线题一次通过 → 提高用户画像等级
 * - 连续 2 个已完成场景在阶段 1-2 中超过半数题目进入二次重试/needs_review → 降低等级
 */

import type { Db } from '../db/connect.js';
import {
  adjustProfileLevel,
  type DifficultyAdjustmentResult,
} from './profile.js';
import { getStageGoalPlan } from './stageGoal.js';

const MAINLINE_STAGES = [1, 2, 3, 4];

interface SceneDialogueRow {
  id: number;
  conversation_id: number;
  scene_id: string;
  title: string;
  difficulty: string;
}

interface AttemptOutcomeRow {
  id: number;
  stage: number;
  status: string;
  retry_count: number;
  is_correct: number | null;
}

export interface SceneDifficultyOutcome {
  conversationId: number;
  sceneId: string;
  title: string;
  firstPass: boolean;
  earlyStruggle: boolean;
}

export interface AutomaticDifficultyAdjustment {
  reason: 'two_scene_first_pass' | 'two_scene_early_struggle';
  adjustment: DifficultyAdjustmentResult;
  scenes: SceneDifficultyOutcome[];
}

export function maybeAdjustDifficultyAfterSceneCompletion(
  db: Db,
  userId: number
): AutomaticDifficultyAdjustment | null {
  const scenes = listRecentCompletedSceneOutcomes(db, userId, 2);
  if (scenes.length < 2) return null;

  if (scenes.every((scene) => scene.firstPass)) {
    return {
      reason: 'two_scene_first_pass',
      adjustment: adjustProfileLevel(db, userId, 'up'),
      scenes,
    };
  }

  if (scenes.every((scene) => scene.earlyStruggle)) {
    return {
      reason: 'two_scene_early_struggle',
      adjustment: adjustProfileLevel(db, userId, 'down'),
      scenes,
    };
  }

  return null;
}

export function listRecentCompletedSceneOutcomes(
  db: Db,
  userId: number,
  limit: number
): SceneDifficultyOutcome[] {
  const rows = db
    .prepare<[number], SceneDialogueRow>(
      `SELECT id, conversation_id, scene_id, title, difficulty
       FROM scene_dialogues
       WHERE user_id = ?
       ORDER BY id DESC`
    )
    .all(userId);

  const out: SceneDifficultyOutcome[] = [];
  for (const row of rows) {
    const attempts = listSceneAttempts(db, row.conversation_id, row.scene_id);
    if (!isSceneCompleted(attempts, row)) continue;
    out.push({
      conversationId: row.conversation_id,
      sceneId: row.scene_id,
      title: row.title,
      firstPass: isFirstPassScene(attempts),
      earlyStruggle: isEarlyStruggleScene(attempts),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function listSceneAttempts(
  db: Db,
  conversationId: number,
  sceneId: string
): AttemptOutcomeRow[] {
  return db
    .prepare<[number, string], AttemptOutcomeRow>(
      `SELECT a.id,
              a.stage,
              a.status,
              a.retry_count,
              g.is_correct
       FROM exercise_attempts a
       LEFT JOIN grading_results g ON g.attempt_id = a.id
       WHERE a.conversation_id = ?
         AND a.scene_id = ?
         AND a.stage BETWEEN 1 AND 4
       ORDER BY a.stage ASC, a.question_no ASC, a.id ASC`
    )
    .all(conversationId, sceneId);
}

function isSceneCompleted(
  attempts: AttemptOutcomeRow[],
  scene: SceneDialogueRow
): boolean {
  const goals = getStageGoalPlan(scene.difficulty);
  return MAINLINE_STAGES.every(
    (stage) => countHandledMainlineAttempts(attempts, stage) >= goals[stage]
  );
}

function countHandledMainlineAttempts(
  attempts: AttemptOutcomeRow[],
  stage: number
): number {
  return attempts.filter(
    (attempt) =>
      attempt.stage === stage &&
      (attempt.is_correct === 1 || attempt.status === 'needs_review')
  ).length;
}

function isFirstPassScene(attempts: AttemptOutcomeRow[]): boolean {
  if (attempts.length === 0) return false;
  return attempts.every(
    (attempt) =>
      attempt.status === 'graded' &&
      attempt.retry_count === 0 &&
      attempt.is_correct === 1
  );
}

function isEarlyStruggleScene(attempts: AttemptOutcomeRow[]): boolean {
  const early = attempts.filter((attempt) => attempt.stage === 1 || attempt.stage === 2);
  if (early.length === 0) return false;
  const struggled = early.filter(
    (attempt) => attempt.retry_count >= 2 || attempt.status === 'needs_review'
  );
  return struggled.length > early.length / 2;
}
