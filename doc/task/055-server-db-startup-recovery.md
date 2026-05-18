> 日期: 2026-05-18
> 序号: 055
> 任务: 恢复服务端数据库启动模块

## 任务背景

运行 `npm run dev` 时，服务端入口从 `server/index.ts` 导入 `./db/connect.js` 失败，报 `ERR_MODULE_NOT_FOUND`。排查发现仓库缺少 `server/db/connect.ts` 与 `server/db/migrate.ts`，且 `.gitignore` 的 `db/` 规则会忽略任意层级的 `db` 目录，导致这类源码目录无法被 Git 跟踪。

## 执行摘要

- `.gitignore` - 将运行时数据库忽略规则从 `db/` 收窄为 `/db/`，只忽略仓库根目录的运行时数据库目录，不再误伤 `server/db/` 源码。
- `server/db/connect.ts` - 恢复 better-sqlite3 连接封装，自动创建数据库目录，并设置 `journal_mode=WAL`、`foreign_keys=ON`、`busy_timeout=5000`。
- `server/db/migrate.ts` - 恢复迁移入口，按 `migrations/*.sql` 顺序执行并写入 `schema_migrations`，同时支持 `npm run migrate` CLI。

## 手工测试

### 后端类型检查

命令:

```bash
npx tsc -p tsconfig.server.json --noEmit
```

实测输出:

```text
无输出，退出码 0。
```

### 数据库迁移入口

命令:

```bash
npm run migrate
```

实测输出:

```text
> echora@0.1.0 migrate
> tsx server/db/migrate.ts

[migrate] applied=2 skipped=0
[migrate] 0001_init.sql, 0002_learning_loop.sql
```

### 服务端测试

命令:

```bash
npm run test:server
```

实测输出:

```text
Test Suites: 16 passed, 16 total
Tests:       141 passed, 141 total
```

### 开发服务启动验证

命令:

```powershell
$outLog = Join-Path $env:TEMP 'echora-dev-verify.out.log'
$errLog = Join-Path $env:TEMP 'echora-dev-verify.err.log'
Remove-Item $outLog, $errLog -Force -ErrorAction SilentlyContinue
Remove-Item 'D:\tmp\echora-dev-verify.db', 'D:\tmp\echora-dev-verify.db-shm', 'D:\tmp\echora-dev-verify.db-wal' -Force -ErrorAction SilentlyContinue
$env:SERVER_PORT = '18787'
$env:DATABASE_PATH = 'D:\tmp\echora-dev-verify.db'
function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) { Stop-ProcessTree ([int]$child.ProcessId) }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}
$p = $null
try {
  $p = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev') -WorkingDirectory 'D:\code\echora' -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  Start-Sleep -Seconds 4
  Invoke-RestMethod -Uri 'http://127.0.0.1:18787/api/health' -TimeoutSec 2 | ConvertTo-Json -Compress
} finally {
  if ($p -and -not $p.HasExited) { Stop-ProcessTree $p.Id }
  Remove-Item Env:\SERVER_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:\DATABASE_PATH -ErrorAction SilentlyContinue
}
```

实测输出:

```json
{"ok":true,"version":"0.1.0","provider":"ready"}
```

服务日志关键片段:

```text
[server] DATABASE_PATH=D:\tmp\echora-dev-verify.db
[server] AI_PROVIDER=stub
[server] 应用 2 个新迁移
[server] 已注册 8 个 Skill: onboarding, scene-select, practice, grade, explain, review, retry, general-chat
[server] AI Provider = stub
[server] Listening on http://localhost:18787
```

### 负向用例: 迁移目录不存在

命令:

```bash
node --import tsx -e "import { connect, closeDb } from './server/db/connect.ts'; import { migrate } from './server/db/migrate.ts'; const db = connect(':memory:'); try { migrate(db, 'D:/tmp/echora-missing-migrations'); console.log('UNEXPECTED_SUCCESS'); process.exitCode = 1; } catch (e) { console.log(e instanceof Error ? e.message : String(e)); } finally { closeDb(db); }"
```

实测输出:

```text
Migrations directory not found: D:/tmp/echora-missing-migrations
```

### 总结

已跑过 5 / 5 步，4 个正向验证通过，1 个负向验证通过。`npm run dev` 已不再因 `server/db/connect.js` 缺失而在导入阶段崩溃。

## 遗留 TODO

- [后端] 后续若已有本地数据库曾被手工初始化但缺少 `schema_migrations` 记录，仍需单独补一次迁移状态修复脚本。
- [文档] 当前文档编码在终端输出中存在乱码显示，未在本次任务中处理。
- [测试] 可追加一个针对 `migrate(db, missingDir)` 的 Jest 单测，避免迁移目录错误被静默吞掉。

## 下一阶段建议

1. **迁移健壮性补测**(PRD §2.7) - 为数据库迁移入口补充单测，覆盖重复执行、缺失目录、部分迁移失败回滚，降低本地数据库状态漂移风险。
2. **启动自检可观测性**(PRD §3.5) - 在启动日志或健康检查中暴露迁移状态摘要，便于开发环境快速定位配置和数据库问题。
3. **流式链路回归**(PRD §2.8) - 在服务端启动恢复后继续跑 smoke 流程，确认数据库持久化、SSE replay 与前端消费仍完整闭环。
4. **发布产物核验**(PRD §5.1) - 下次发布前运行 `npm run release`，确认 `dist-server/server/db/migrate.js` 被正确打包并能在 release 包内执行。
