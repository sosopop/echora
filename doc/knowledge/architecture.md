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
  → registerAllSkills (8 Skill;onboarding 已真实接入,其余仍 stub)
  → createProvider (Stub | Anthropic;Anthropic 已真实接入,需 API key)
  → createAIRouter
  → createApp({ config, db, skillRegistry, aiRouter, provider })
  → app.listen(port)
```

`createApp` 装配 `/api/auth` `/api/profile` `/api/chat` 三组路由。chat router 的 deps 包含 provider,因为 skill handler 可在 ServerSkillContext 中拿到 provider 调 chat()。`/api/chat/stream` 采用 fetch + ReadableStream 的客户端读取方式,服务端仍返回 SSE 文本流;它先按 `Last-Event-ID` / `lastSeq` replay 内存 ring buffer,若对应 assistant 消息的 `stream_events` 已持久化且内存缓存不可用,会先从数据库回放已落盘事件,再通过轮询补回新写入事件,以覆盖多副本或内存丢失场景。

042 起,`createApp` 会自动生成或透传 `traceId` 到 `req.traceId` 与 `X-Request-Id` 响应头,聊天流和错误响应可用同一请求标识串联排障。`agent_runs.payload` 也会持续写入 `traceId`、`finalSeq` 与 `textLength`,用于长流诊断。

目录边界:
- `server/` 后端入口 / 路由 / 服务 / 数据库 / Skills / providers / middleware
- `src/` 前端入口 / 路由 / stores / views / components / api / styles
- `shared/` 前后端共享(SkillEvent / Widget zod / API DTO / 错误码)— **禁止导入后端依赖**
- `migrations/` SQL 迁移文件,顺序应用
- `tests/smoke/` 跨层端到端冒烟
- `dist-server/` `dist-web/` `release/` 构建产物,不入版本控制

### SkillEvent 类型(002 起 9 类型)

`shared/skill.ts` 中 `SkillEventInput` 联合类型:

| 类型 | 触发条件 | 副作用 |
|---|---|---|
| `text-chunk` | LLM 文本增量 | 累积到 messages.content |
| `widget-init` | Skill 首次发出 widget | 写 widget_snapshot |
| `widget-update` | widget 字段 patch | merge 到 snapshot |
| `widget-ready` | widget 可交互 | merge 到 snapshot |
| `mode-switch` | 切换输入模式 | 更新 conversations.input_mode |
| `quick-actions` | 推送快捷按钮 | 仅前端消费 |
| `state-transition` | 学习态转移(002 新增) | 更新 conversations.learning_state + active_skill |
| `done` | 流结束 | runUpdate(status='done') |
| `error` | Skill 抛错 | runUpdate(status='failed') |

`state-transition` 与 `mode-switch` 对称,都是在事件流中的副作用事件。它由 onboarding skill 在画像采集完成后产出。grade skill 暂未迁移(仍由 chat.ts 兼容分支硬编码),003 任务再迁移。

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

- 进程内 streamBus 升级到 Redis Streams(多副本部署需要)
