/**
 * /api/profile 路由
 *
 *   GET  /api/profile     当前用户画像
 *   PUT  /api/profile     更新画像(partial)
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connect.js';
import type { Config } from '../config/getConfig.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureProfile, upsertProfile } from '../services/profile.js';

const profileUpdateSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    age: z.number().int().min(1).max(150).optional(),
    grade: z.string().min(1).max(64).optional(),
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
    weaknessTags: z.array(z.string().min(1).max(64)).max(50).optional(),
    recentTopics: z.array(z.string().min(1).max(64)).max(50).optional(),
  })
  .strict();

export interface ProfileRouterDeps {
  db: Db;
  config: Config;
}

export function createProfileRouter(deps: ProfileRouterDeps): Router {
  const router = Router();
  const { db, config } = deps;
  const auth = requireAuth(config, db);

  router.get('/', auth, (req, res) => {
    const profile = ensureProfile(db, req.user!.id);
    res.json({ data: profile });
  });

  router.put('/', auth, (req, res, next) => {
    try {
      const patch = profileUpdateSchema.parse(req.body);
      const updated = upsertProfile(db, req.user!.id, patch);
      res.json({ data: updated });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
