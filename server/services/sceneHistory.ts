/**
 * 已用场景队列(scene_history 表)服务
 *
 * PRD §2.5:每用户最大 10 条用于场景去重 prompt。
 * append 时自动 prune 最旧条目,保持 ≤ 10。
 */

import type { Db } from '../db/connect.js';

export const SCENE_HISTORY_MAX = 10;

/**
 * 追加一条已用场景。若已达 max,删最旧一条后再插入(单事务)。
 */
export function appendSceneHistory(
  db: Db,
  userId: number,
  sceneTopic: string
): void {
  const tx = db.transaction(() => {
    const count = db
      .prepare<[number], { c: number }>(
        'SELECT COUNT(*) AS c FROM scene_history WHERE user_id = ?'
      )
      .get(userId);
    const current = count?.c ?? 0;
    if (current >= SCENE_HISTORY_MAX) {
      const toDelete = current - SCENE_HISTORY_MAX + 1;
      db.prepare(
        `DELETE FROM scene_history
         WHERE id IN (
           SELECT id FROM scene_history
           WHERE user_id = ?
           ORDER BY used_at ASC, id ASC
           LIMIT ?
         )`
      ).run(userId, toDelete);
    }
    db.prepare(
      'INSERT INTO scene_history (user_id, scene_topic) VALUES (?, ?)'
    ).run(userId, sceneTopic);
  });
  tx();
}

export function listSceneHistory(
  db: Db,
  userId: number,
  limit = SCENE_HISTORY_MAX
): string[] {
  const rows = db
    .prepare<[number, number], { scene_topic: string }>(
      `SELECT scene_topic FROM scene_history
       WHERE user_id = ?
       ORDER BY used_at DESC, id DESC
       LIMIT ?`
    )
    .all(userId, limit);
  return rows.map((r) => r.scene_topic);
}
