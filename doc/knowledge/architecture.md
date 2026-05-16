# Architecture

## 入口

- 后端启动入口:`server/index.ts`
- 后端装配点:`server/createApp.ts`(返回 Express app,不调 listen,便于测试注入)
- 前端启动入口:`src/main.tsx`
- 前端路由表:`src/router.tsx`

## 关键源码

启动链路严格按 ESD §5.1:

```
getConfig
  → connect (better-sqlite3)
  → migrate (扫描 migrations/*.sql)
  → registerAllSkills (8 Skill stub)
  → createProvider (Stub | Anthropic)
  → createAIRouter
  → createApp(deps)
  → app.listen(port)
```

目录边界:
- `server/` 后端入口 / 路由 / 服务 / 数据库 / Skills / providers / middleware
- `src/` 前端入口 / 路由 / stores / views / components / api / styles
- `shared/` 前后端共享(SkillEvent / Widget zod / API DTO / 错误码)— **禁止导入后端依赖**
- `migrations/` SQL 迁移文件,顺序应用
- `tests/smoke/` 跨层端到端冒烟
- `dist-server/` `dist-web/` `release/` 构建产物,不入版本控制

## 约束与失败点

- **NodeNext 强制 .js 后缀**:`server/` 内相对导入即使源是 `.ts` 也必须写 `'./db/connect.js'`,否则运行时 ERR_MODULE_NOT_FOUND
- **path 别名**:`@shared/*` 仅前端 Vite 编译期解析。后端不要在源码用,否则编译产物 import 失败
- **shared/ 边界**:严禁导入 better-sqlite3 / express / jsonwebtoken,否则 Vitest jsdom 环境会因 native module 报错
- **better-sqlite3 编译**:Windows 首次失败时 `npm config set msvs_version 2022` 重试

## 测试入口

- 后端:`server/__tests__/health.test.ts`(supertest)— 跑 `npm run test:server`
- 前端:`src/__tests__/App.test.tsx`(vitest)— 跑 `npm run test:web`
- 端到端:`tests/smoke/run-smoke.ts`(register → send → SSE)— 跑 `npm run test:smoke`
- 全跑:`npm test`

## Pending

- 真实 Anthropic Provider 接入(目前 stub)
- SSE 由 ?token= 迁移到 fetch + ReadableStream
- 进程内 streamBus 升级到 Redis Streams(多副本部署需要)
