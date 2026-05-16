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

`createApp` 装配 `/api/auth` `/api/profile` `/api/chat` 三组路由。chat router 的 deps 包含 provider,因为 skill handler 可在 ServerSkillContext 中拿到 provider 调 chat()。

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

- SSE 由 ?token= 迁移到 fetch + ReadableStream
- 进程内 streamBus 升级到 Redis Streams(多副本部署需要)
- grade skill 自身 yield state-transition,删除 chat.ts 的硬编码兼容分支
