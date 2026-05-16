> 日期: 2026-05-16
> 序号: 001
> 任务: 建立 Echora V1 MVP 基础工程框架

## 任务背景

仓库前期只有 `doc/esd.md` `doc/prd.md` `DESIGN.md` 与 `doc/design/` 28 文件原型,无任何源码。本次任务依据三份文档与原型,一次性落地 Node + TypeScript ESM 全栈骨架,使后续业务迭代只需在已就位的接口与目录里填充实现,不必再改框架本身。锁定作用域:Stub Provider + Anthropic 骨架双 Provider · 前端骨架 + 路由占位 · 8 个 Skill 全 stub · 10 张表一次迁移到位。

## 执行摘要

### 工程基建
- `package.json` — 9 dep + 25 devDep,11 个 npm script(对齐 ESD §4)
- `tsconfig.json` — 前端 Bundler,paths `@/*` `@shared/*`
- `tsconfig.server.json` — 后端 NodeNext + strict,outDir `dist-server`
- `tsconfig.node.json` — Vite 配置自身的类型上下文
- `vite.config.ts` — Vite 5 + Vitest + dev proxy `/api → 8787`
- `jest.config.js` — `ts-jest/presets/default-esm` + `.js → TS` moduleNameMapper
- `index.html` `.env.example` `.gitignore` `README.md` 启动指引

### 共享契约
- `shared/skill.ts` — `Skill` 接口、`SkillEventInput` 8 类型联合、`SkillContext`、`RouterDecision`、`LearningState` 7 态、`SKILL_NAMES` 常量
- `shared/widget.ts` — 12 Widget 的 zod schema(`z.discriminatedUnion('type', [...])`),`WidgetStatus` 6 态,`ErrorTag` 12 标签
- `shared/api.ts` — Auth/Chat/Conversation/Message DTO
- `shared/errors.ts` — 统一错误码常量

### 数据层
- `migrations/0001_init.sql` — 全 10 业务表(users / user_profiles / conversations / messages / branch_threads / exercise_attempts / grading_results / error_tag_events / mastery_records / agent_runs)+ 必要索引 + `schema_migrations` 元表
- `migrations/README.md` — 命名约定 `NNNN_<slug>.sql`、不可回滚、可重复执行
- `server/config/getConfig.ts` — env > 配置文件 > 默认值三层优先级,UPPER_SNAKE 与 camelCase 双键名识别,生产默认密钥 warn
- `server/db/connect.ts` — better-sqlite3 + WAL + foreign_keys + busy_timeout,自动建目录
- `server/db/migrate.ts` — 顺序扫描 + 事务 + 元表记账,可作 CLI 直跑

### 后端框架
- `server/skills/registry.ts` + `server/skills/index.ts` — `SkillRegistry` 类与 `registerAllSkills()` 一键注册
- `server/skills/{onboarding,sceneSelect,practice,grade,explain,review,retry,generalChat}.ts` — 8 个 stub,各自产 `text-chunk` + 必要 `mode-switch` + `widget-init/ready` + `done`
- `server/ai/types.ts` — `AIProvider` 接口
- `server/ai/providers/{stub,anthropic,index}.ts` — Stub 默认返回 general-chat 决策;Anthropic 骨架抛 NotImplemented;工厂按 `AI_PROVIDER` 选择
- `server/ai/router.ts` — `createAIRouter`:provider.route → 校验 skill 存在 → 校验 allowedStates → 失败降级
- `server/services/streamBus.ts` — 内存 SSE 总线,每流 200 事件 ring buffer,断线 lastSeq replay
- `server/services/conversation.ts` — 会话 CRUD + 状态/输入模式更新
- `server/services/message.ts` — 消息追加 + `stream_events` JSON 累积 + content/widget_snapshot 同步
- `server/middleware/auth.ts` — JWT 校验,挂 `req.user`,SSE 兼容 `?token=`
- `server/middleware/error.ts` — 统一 `{ error: { code, message } }`,捕 zod / HttpError / 兜底 500
- `server/routes/auth.ts` — register/login/me
- `server/routes/chat.ts` — conversations/messages CRUD + send + SSE stream + 后台 Skill handler 执行 + agent_runs 落盘
- `server/createApp.ts` — 装配 Express,可被 supertest 注入
- `server/index.ts` — 入口启动链路严格按 ESD §5.1
- `scripts/dev-server.js` — `NODE_ENV=development` + `tsx watch`

### 前端骨架
- `src/styles/{tokens,components}.css` — 从 `doc/design/styles/` 拷贝,含双主题 token
- `src/api/{client,sse,auth,chat}.ts` — fetch 封装(自动 token / 401 回调)、EventSource 封装(lastSeq 重连)、模块化调用
- `src/stores/{auth,profile,chat,learningState,theme}.ts` — Zustand store 全套
- `src/views/{Login,Register,Onboarding,Chat}/index.tsx` — 4 个占位组件
- `src/{App,router,main}.tsx` — React Router v6 装配,样式注入,401 回调注入,auth.hydrate
- `src/__tests__/{setup,App}.test.tsx` — Vitest 占位

### 测试与发布
- `server/__tests__/health.test.ts` — supertest GET /api/health
- `tests/smoke/run-smoke.ts` — 端到端 register → send → 用 fetch+ReadableStream 解析 SSE,断言 text-chunk + done
- `scripts/release.js` — rm release/ → npm run build → 拷贝产物 + 精简 package.json + 启动 README

### 知识库
- `doc/knowledge/README.md` — 6 篇路由,task-handoff 标"⚠ 协作者必读"置顶
- `doc/knowledge/task-handoff.md` — 永久 AI 协作约定
- `doc/knowledge/{architecture,api-contract,skills,state-machine,styling}.md` — 4 段固定结构(入口 / 关键源码 / 约束与失败点 / 测试入口),正文已填关键事实,Pending 区域留待补

### 验证结果

| 命令 | 结果 |
|---|---|
| `npm install` | ✓ 编译 better-sqlite3 通过 |
| `npx tsc -p tsconfig.server.json --noEmit` | ✓ 后端类型干净 |
| `npx tsc -p tsconfig.json --noEmit` | ✓ 前端类型干净 |
| `npm run migrate` | ✓ 应用 0001_init,db/echora.db 生成 |
| `npm run test:server` | ✓ 1 passed |
| `npm run test:web` | ✓ 1 passed |
| `npm run test:smoke` | ✓ register / send / stream 三步全过 |
| `npm run release` | ✓ release/ 内 dist-server / dist-web / migrations / 精简 package.json / README |
| 手工 `curl /api/health` | ✓ `{"ok":true,...}` |
| 手工 `curl POST /api/auth/register` | ✓ 返回 token + user |

## 遗留 TODO

### 后端
- [后端] **Anthropic Provider 真实接入**:`server/ai/providers/anthropic.ts` `route` / `complete` 当前抛 NotImplemented,需接 `@anthropic-ai/sdk` `messages.create` 流式
- [后端] **Skill 取消机制**:`ctx.signal` 已传入但 stub handler 未消费,真实 Skill 需 `if (ctx.signal.aborted) break`
- [后端] **8 个 Skill 业务实现**:全部仅 stub,需替换为真实 prompt + 解析 + 落库逻辑
- [后端] **JWT 刷新令牌**:V1 仅 7 天 access token,无 refresh,过期即重登
- [后端] **agent_runs.payload 完整化**:当前只写 `decision`,后续补 `finalSeq` `outputBytes` 等指标
- [后端] **进程内 streamBus → Redis Streams**:多副本部署需要

### 前端
- [前端] **4 个 view 接 store 真实交互**:Login/Register/Onboarding/Chat 当前只渲染占位
- [前端] **12 Widget React 组件**:`src/components/widgets/` 待按原型 `doc/design/widgets/` 拆出 12 个 React 组件
- [前端] **Chat 三栏完整实现**:历史抽屉、消息列表(虚拟化)、辅助追问支线
- [前端] **EventSource → fetch+ReadableStream**:消除 `?token=` URL 泄露
- [前端] **profile API**:store 有占位,后端 `routes/profile.ts` 待建

### 文档
- [文档] **knowledge 各篇 Pending 区**:架构变更后逐一回填
- [文档] **API 契约 OpenAPI 化**:目前是 markdown 表格,未来量大可考虑 OpenAPI

### 测试
- [测试] **Skill 输出契约测试**:`server/__tests__/skill-<name>.test.ts` 8 个,断言事件序列与 widget zod 校验
- [测试] **AI Router 校验链测试**:fallback 路径覆盖
- [测试] **状态机转移测试**:`server/__tests__/conversation.test.ts`
- [测试] **前端 store 测试**:`src/__tests__/stores/*.test.ts`,覆盖 chat / auth / theme

## 下一阶段建议

1. **Onboarding 端到端可走通**(PRD §2.2 onboarding Skill + §2.6 user_profiles)— 让新用户从注册到画像收集闭环。优先级最高,卡住所有后续学习流。落地切入点:`server/routes/profile.ts` + `onboardingSkill` 真实实现 + `Onboarding.tsx` 接 store。
2. **scene-select + practice + grade 学习闭环**(PRD §2.1 用户旅程 + §2.5 6 题型)— 选 1 个题型(建议半句翻译,实现成本最低)打通「场景→出题→批改→更新掌握度」首版闭环,跑通 mastery_records 与 error_tag_events 写入。这是 Echora 的核心价值证明。
3. **接入真实 Anthropic Provider**(PRD §1.4 + §2.3)— 替换 Stub,验证流式 SSE 与 `messages.create` 的兼容性,落实"Echo 正在生成"的自然文案。允许在第 2 条之前/之后做,取决于是否想先用 stub 把闭环跑通再换 Provider。
4. **辅助追问支线**(PRD §3.2 + branch_threads 表)— 实现 `source_ref` 携带 + 锁定题前不漏答案。这是 Echora 区别于普通 chat 的关键体验,需在主流稳定后做以避免双流互相干扰。
5. **会话锁定与防抄袭**(PRD §3.1 + conversations.lock_policy)— 在 `practicing` / `grading` 期间隐藏历史详情,`reviewing` / `awaiting_next` 自动恢复。状态机基础已就位,只差服务层根据 learning_state 控制返回字段。
