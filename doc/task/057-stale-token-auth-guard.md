> 日期: 2026-05-18
> 序号: 057
> 任务: 修复旧 token 触发 profile 外键错误

## 任务背景

本地服务启动后访问前端时,浏览器可能仍保留旧 SQLite 数据库签发的 JWT。该 token 签名仍有效,但当前数据库中已没有对应 `users.id`,导致 `/api/profile` 进入 `ensureProfile` 后插入 `user_profiles` 触发 `FOREIGN KEY constraint failed`。

## 执行摘要

- `server/middleware/auth.ts` - `requireAuth(config, db?)` 支持在 JWT 校验后查询当前数据库用户;用户不存在时统一返回 `401 TOKEN_EXPIRED`,并阻止业务路由继续执行。
- `server/routes/auth.ts` - `/api/auth/me` 改为使用带 DB 校验的认证中间件,旧 token 会促使前端清理登录态并重新登录。
- `server/routes/profile.ts` - `/api/profile` 改为在进入 `ensureProfile/upsertProfile` 前完成用户存在性校验,避免 profile 外键异常。
- `server/routes/chat.ts` - chat API 与 SSE 共用的 `auth` 也启用 DB 用户校验,避免旧 token 访问会话/流式接口。
- `server/__tests__/profile.test.ts` - 增加旧 token 访问 `/api/profile`、`/api/auth/me`、`/api/chat/conversations` 的回归测试,并断言不会创建孤儿 profile。
- `doc/knowledge/api-contract.md` - 记录鉴权契约:JWT 有效但用户不存在时返回 `401 TOKEN_EXPIRED`。

## 手工测试

### 类型检查

命令:

```powershell
npx tsc -p tsconfig.server.json --noEmit
```

观察输出:

```text
无输出,退出码 0
```

结论:后端 TypeScript 编译通过。

### 聚焦后端回归测试

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/profile.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/profile.test.ts
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

结论:`/profile` 正常路径、未登录负样本、旧 token 负样本、`/auth/me` 与 chat 鉴权负样本均通过。

### 后端测试套件

命令:

```powershell
npm run test:server
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       147 passed, 147 total
```

结论:后端全量 Jest 套件通过。

### 单元测试套件

命令:

```powershell
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       147 passed, 147 total

Test Files  13 passed (13)
Tests       94 passed (94)
```

结论:后端 Jest 与前端 Vitest 均通过。Vitest 期间出现的 stderr 为既有测试模拟 500 日志与 React Router future flag warning,不影响结果。

### 旧 token 负样本复现

命令:

```powershell
@'
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect, closeDb } from './server/db/connect.ts';
import { migrate } from './server/db/migrate.ts';
import { registerAllSkills } from './server/skills/registry.ts';
import { createProvider } from './server/ai/providers/index.ts';
import { createAIRouter } from './server/ai/router.ts';
import { createApp } from './server/createApp.ts';
import { signToken } from './server/middleware/auth.ts';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echora-manual-'));
const dbPath = path.join(tmpDir, 'test.db');
const config = {
  port: 0,
  databasePath: dbPath,
  jwtSecret: 'manual-secret',
  aiProvider: 'stub',
  anthropicApiKey: null,
  anthropicBaseURL: 'https://api.anthropic.com',
  anthropicModel: 'claude-sonnet-4-6',
  openaiApiKey: null,
  openaiBaseURL: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
  corsOrigin: ['http://localhost'],
  nodeEnv: 'test',
};
const db = connect(dbPath);
migrate(db);
const skillRegistry = await registerAllSkills();
const provider = createProvider(config);
const aiRouter = createAIRouter(provider, skillRegistry);
const app = createApp({ config, db, skillRegistry, aiRouter, provider });
const staleUserId = 424242;
const token = signToken({ id: staleUserId, email: 'ghost@test.com' }, config.jwtSecret);
const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);
const orphanProfile = db
  .prepare('SELECT COUNT(*) AS count FROM user_profiles WHERE user_id = ?')
  .get(staleUserId);
console.log(JSON.stringify({
  status: res.status,
  code: res.body.error?.code,
  message: res.body.error?.message,
  orphanProfileCount: orphanProfile.count,
}, null, 2));
closeDb(db);
fs.rmSync(tmpDir, { recursive: true, force: true });
'@ | node --import tsx
```

观察输出:

```json
{
  "status": 401,
  "code": "TOKEN_EXPIRED",
  "message": "访问令牌对应的用户不存在，请重新登录",
  "orphanProfileCount": 0
}
```

结论:旧 token 不再触发 `FOREIGN KEY constraint failed`,也不会创建孤儿 profile。已跑过 5 / 5 步,全部通过。

## 遗留 TODO

- [前端] 当前修复依赖既有 401 清理登录态逻辑;后续可增加旧 token 水合场景的显式 UI 回归测试。
- [后端] 若未来引入 refresh token 或多设备会话表,需要把“用户存在性 + 会话有效性”收敛到同一认证服务。

## 下一阶段建议

1. **认证恢复体验**(PRD §2.1 用户旅程 / §3.5 异常与恢复):为 token 失效或本地库重建后的重登路径增加更明确的 UI 提示,减少用户看到空白或跳转抖动的概率。
2. **负样本验收补强**(PRD §5.2 负样本验收):把旧 token、缺失用户、跨用户会话等鉴权负样本纳入 smoke 或更高层 E2E,覆盖浏览器持久化状态。
3. **Agent 质量与安全**(PRD §3.3 Agent 质量与安全):继续强化 provider/router 错误的显式失败路径,保持“不静默 fallback”的工程边界。
