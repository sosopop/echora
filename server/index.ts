/**
 * 后端入口 — 启动链路严格按 ESD §5.1
 *
 *   getConfig
 *   → connect
 *   → migrate
 *   → registerAllSkills
 *   → createProvider
 *   → createAIRouter
 *   → createApp
 *   → listen
 */

import { getConfig } from './config/getConfig.js';
import { connect } from './db/connect.js';
import { migrate } from './db/migrate.js';
import { registerAllSkills } from './skills/registry.js';
import { createProvider } from './ai/providers/index.js';
import { createAIRouter } from './ai/router.js';
import { createApp } from './createApp.js';

async function main(): Promise<void> {
  const config = getConfig();
  console.log(`[server] NODE_ENV=${config.nodeEnv}`);
  console.log(`[server] DATABASE_PATH=${config.databasePath}`);
  console.log(`[server] AI_PROVIDER=${config.aiProvider}`);

  const db = connect(config.databasePath);
  const migration = migrate(db);
  if (migration.applied.length > 0) {
    console.log(`[server] 应用 ${migration.applied.length} 个新迁移`);
  }

  const skillRegistry = await registerAllSkills();
  console.log(
    `[server] 已注册 ${skillRegistry.list().length} 个 Skill: ${skillRegistry
      .names()
      .join(', ')}`
  );

  const provider = createProvider(config);
  console.log(`[server] AI Provider = ${provider.name}`);

  const aiRouter = createAIRouter(provider, skillRegistry);

  const app = createApp({ config, db, skillRegistry, aiRouter, provider });

  app.listen(config.port, () => {
    console.log(`[server] Listening on http://localhost:${config.port}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection', reason);
});

main().catch((err) => {
  console.error('[server] 启动失败', err);
  process.exit(1);
});
