/**
 * 用户画像域服务
 *
 * 封装 user_profiles 表的 CRUD。
 * JSON 字段(weakness_tags / recent_topics)在此层 parse / stringify;
 * parse 失败 fallback 到 [],防止旧脏数据炸接口。
 */

import type { Db } from '../db/connect.js';
import type { ProfileDTO, ProfileUpdateReq, CefrLevel } from '../../shared/api.js';

interface ProfileRow {
  user_id: number;
  name: string | null;
  age: number | null;
  grade: string | null;
  level: string | null;
  weakness_tags: string | null;
  recent_topics: string | null;
  created_at: string;
  updated_at: string;
}

const ALLOWED_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type DifficultyFeedbackDirection = 'up' | 'down';

export interface DifficultyAdjustmentResult {
  direction: DifficultyFeedbackDirection;
  previousLevel: CefrLevel;
  nextLevel: CefrLevel;
  changed: boolean;
}

function safeParseArray(v: string | null): string[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rowToDTO(row: ProfileRow): ProfileDTO {
  const level: CefrLevel | null =
    row.level && (ALLOWED_LEVELS as string[]).includes(row.level)
      ? (row.level as CefrLevel)
      : null;
  return {
    userId: row.user_id,
    name: row.name,
    age: row.age,
    grade: row.grade,
    level,
    weaknessTags: safeParseArray(row.weakness_tags),
    recentTopics: safeParseArray(row.recent_topics),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 读取画像。不存在返回 null(理论上 register 后必有,但保留 null 路径以兼容旧数据)。
 */
export function getProfile(db: Db, userId: number): ProfileDTO | null {
  const row = db
    .prepare<[number], ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ?')
    .get(userId);
  return row ? rowToDTO(row) : null;
}

/**
 * 不存在则建空行,返回 DTO。可在事务内调用。
 */
export function ensureProfile(db: Db, userId: number): ProfileDTO {
  const existing = getProfile(db, userId);
  if (existing) return existing;
  db.prepare(
    `INSERT INTO user_profiles (user_id, weakness_tags, recent_topics)
     VALUES (?, '[]', '[]')`
  ).run(userId);
  const created = getProfile(db, userId);
  if (!created) throw new Error('ensureProfile 后查询失败');
  return created;
}

/**
 * partial 更新指定字段;不在 patch 中的字段保持原值。
 * 自动确保行存在(内部 ensureProfile)。
 */
export function upsertProfile(
  db: Db,
  userId: number,
  fields: ProfileUpdateReq
): ProfileDTO {
  ensureProfile(db, userId);

  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.age !== undefined) {
    sets.push('age = ?');
    values.push(fields.age);
  }
  if (fields.grade !== undefined) {
    sets.push('grade = ?');
    values.push(fields.grade);
  }
  if (fields.level !== undefined) {
    sets.push('level = ?');
    values.push(fields.level);
  }
  if (fields.weaknessTags !== undefined) {
    sets.push('weakness_tags = ?');
    values.push(JSON.stringify(fields.weaknessTags));
  }
  if (fields.recentTopics !== undefined) {
    sets.push('recent_topics = ?');
    values.push(JSON.stringify(fields.recentTopics));
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    values.push(userId);
    db.prepare(
      `UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`
    ).run(...values);
  }

  const after = getProfile(db, userId);
  if (!after) throw new Error('upsertProfile 后查询失败');
  return after;
}

export function adjustProfileLevel(
  db: Db,
  userId: number,
  direction: DifficultyFeedbackDirection
): DifficultyAdjustmentResult {
  const profile = ensureProfile(db, userId);
  const previousLevel = profile.level ?? 'B1';
  const index = ALLOWED_LEVELS.indexOf(previousLevel);
  const nextIndex =
    direction === 'up'
      ? Math.min(ALLOWED_LEVELS.length - 1, index + 1)
      : Math.max(0, index - 1);
  const nextLevel = ALLOWED_LEVELS[nextIndex];
  if (nextLevel !== previousLevel) {
    upsertProfile(db, userId, { level: nextLevel });
  }
  return {
    direction,
    previousLevel,
    nextLevel,
    changed: nextLevel !== previousLevel,
  };
}

/**
 * onboarding 是否完成:必填 name + level。其他字段选填。
 */
export function isOnboardingComplete(p: ProfileDTO | null): boolean {
  return !!(p && p.name && p.level);
}
