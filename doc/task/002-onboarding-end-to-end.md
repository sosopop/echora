> 日期: 2026-05-16
> 序号: 002
> 任务: Onboarding 端到端 + Anthropic Provider 真实接入

## 任务背景

001 落地工程骨架后,onboarding 链路全为 stub/占位:8 个 Skill 都是 stub,Anthropic Provider 抛 NotImplemented,Onboarding 视图是占位卡片,没有 profile 路由,刷新后落入 /chat 看到空壳。本次 002 打通注册 → 画像采集 → 进 chat 的端到端,同时落地 Anthropic Provider 真实接入(LLM 驱动 onboarding 必须先有真实 Provider,两者强耦合)。落地后,新用户注册 5-10 句对话内完成画像采集,自动进入 /chat 等待场景推荐。

## 执行摘要

### 共享契约 (commit 1)
- `shared/skill.ts` — `SkillEventInput` 增 `state-transition` 类型(8 → 9 类型)
- `shared/api.ts` — 新增 `ProfileDTO` / `ProfileUpdateReq` / `CefrLevel`,`MeResp` 增 `profile` + `onboardingCompleted`
- `server/ai/types.ts` — 重构 `AIProvider`:删 `complete`,增 `chat?(ChatRequest): AsyncIterable<ChatStreamEvent>`,新增 `ChatMessage` / `ToolDef` / `ChatStreamEvent`
- `server/ai/providers/anthropic.ts` — 真实 SDK 接入:`route()` 用 `tool_use`(`route_to_skill` 工具)强制 JSON;`chat()` 用 `messages.stream` 转换为 ChatStreamEvent;支持 abort signal
- `server/ai/providers/index.ts` — 透传 baseURL/model
- `server/config/getConfig.ts` — 新增 `anthropicBaseURL`(默认 `https://api.anthropic.com`)、`anthropicModel`(默认 `claude-sonnet-4-6`),BASE_URL trim 末尾 `/`
- `.env.example` — 新增 ANTHROPIC_BASE_URL / ANTHROPIC_MODEL 注释项

### profile 服务 + 路由 (commit 2)
- `server/services/profile.ts` — `getProfile` / `ensureProfile` / `upsertProfile` / `isOnboardingComplete`,JSON 字段 parse 失败 fallback `[]`
- `server/routes/profile.ts` — `GET /api/profile`(自动 ensure)、`PUT /api/profile`(zod partial 校验,strict mode)
- `server/createApp.ts` — 挂载 createProfileRouter
- `server/routes/auth.ts` — register 同事务 `ensureProfile`(失败整体回滚);`/me` 返回 `{ profile, onboardingCompleted }`

### Onboarding Skill 真实实现 (commit 3)
- `server/skills/types.ts` — `ServerSkillContext extends SkillContext { provider, db }`(解决 shared 不能依赖 server 类型)
- `server/skills/_helpers/onboardingFsm.ts` — `decideMissingFields` / `buildSystemPrompt`(中文系统提示 + CEFR 映射指南) / `updateProfileTool`(JSON Schema)
- `server/skills/onboarding.ts` — 真实 handler:读 profile → 短路完成态 → chat() 流式 → tool_use 累积 → upsertProfile → state-transition → done
- `server/routes/chat.ts` — `ChatRouterDeps` 增 `provider`,handleSideEffects 消费 `state-transition`,grade skill 兼容分支保留 + TODO 标注;`POST /chat/conversations` 接收可选 `learningState`
- `server/createApp.ts` + `server/index.ts` — 透传 provider

### 前端 profile + store 联动 (commit 4)
- `src/api/profile.ts` — `profileApi.get/update`
- `src/stores/profile.ts` — 真实 `load/reload/update/reset`,导出 `selectIsOnboardingComplete`
- `src/stores/auth.ts` — 新增 `hydrated` 字段;hydrate/login/register 联动 `useProfileStore.load`,logout 联动 `reset`
- `src/stores/chat.ts` — `handleStreamEvent` 消费 `state-transition`(setState + reload profile)
- `src/api/chat.ts` — `createConversation` 透传 `learningState`

### 路由守卫 + Onboarding 视图 (commit 5)
- `src/components/RouteGuard.tsx` — 6 矩阵守卫(未 hydrate 渲染空 / 未登录跳 login / profile 未加载渲染空 / 未完成跳 onboarding / 已完成跳 chat)
- `src/router.tsx` — 包裹 `<RouteGuard>`
- `src/views/Onboarding/index.tsx` — 装配 4 子组件 + mount 自动 init 会话 + 自动发送 'hi' 触发 skill
- `src/views/Onboarding/{ProgressBar,ProfilePills,ChatStream,InputBar}.tsx` + `index.module.css` — 按原型 `doc/design/pages/onboarding.html` 还原

### 测试与发布 (commit 6)
- `server/__tests__/profile.test.ts` — 5 测试覆盖 GET/PUT/me/401/校验
- `server/__tests__/auth-register-creates-profile.test.ts` — 1 测试副作用
- `server/__tests__/skill-onboarding.test.ts` — 5 测试(text-delta→chunk / tool-use 落库 / 字段不全无 transition / provider.chat 缺失 / signal abort / 短路)
- `src/__tests__/stores/profile.test.ts` — 7 测试覆盖 store CRUD 与派生
- `src/__tests__/components/RouteGuard.test.tsx` — 8 测试 6 矩阵 + 2 等待场景
- `tests/smoke/run-smoke.ts` — 扩展 profile-empty / profile-update / me-onboarding-completed 三步
- `doc/knowledge/{architecture,api-contract,skills,styling}.md` — 同步 state-transition 第 9 类、profile 路由、AI Provider env、CSS Module 约定

### 验证结果

| 命令 | 结果 |
|---|---|
| `npx tsc -p tsconfig.server.json --noEmit` | ✓ 后端类型干净 |
| `npx tsc -p tsconfig.json --noEmit` | ✓ 前端类型干净 |
| `npm run test:server` | ✓ 13 passed (4 suites) |
| `npm run test:web` | ✓ 16 passed (3 suites) |
| `npm run test:smoke` | ✓ 6/6 (register / profile-empty / profile-update / me / send / stream) |

## 遗留 TODO

### 后端
- [后端] **grade skill 自身 yield state-transition**:目前由 `chat.ts` 兼容分支硬编码 `if (skill.name === 'grade') updateLearningState(..., 'awaiting_next', null)`。grade skill 003 真实接入后须自产 state-transition,删除兼容分支。
- [后端] **其余 7 Skill 仍 stub**:onboarding 已真实接入;scene-select / practice / grade / explain / review / retry / general-chat 仍是 stub 文本流。
- [后端] **AI Router 低置信度处理**:`route()` 返回 confidence 但当前未触发 intent-confirm widget。<0.5 应弹出选项确认,而不是直接执行 skill。
- [后端] **Onboarding kickoff 消息隐藏**:用户当前可见自己说了「hi」,后续协议需要 `meta.kind='kickoff'` 让前端跳过渲染。
- [后端] **OpenRouter / Bedrock 等替代 endpoint 验证**:`ANTHROPIC_BASE_URL` 配置已支持但仅默认 endpoint 跑过。
- [后端] **AI Provider 错误日志细化**:模型 ID 错配时 SDK 返 404,现仅 catch 后降级,未给运维友好提示。

### 前端
- [前端] **account-gate Widget React 组件**:onboarding 完成自然语言提示,后续若需弹出保存进度提示卡需实现该组件。
- [前端] **Profile 编辑页**:用户事后想修改画像无入口,只能调 PUT /api/profile。
- [前端] **Onboarding 视图响应式 < 768px**:当前桌面端布局,移动端 fixed footer 与软键盘联动未优化。
- [前端] **EventSource 仍走 `?token=`**:URL 日志泄露风险未消除,生产化前必须迁 fetch + ReadableStream。

### 测试
- [测试] **AI Router 校验链测试**:fallback 路径(provider.route 抛错 / skill 不存在 / state 不允许)未单测。
- [测试] **状态机转移合法性测试**:`server/__tests__/conversation.test.ts` 未建。
- [测试] **真实 Anthropic 接入烟雾**:仅手工流程,未自动化(需 mock SDK 后才能跑)。

### 文档
- [文档] **PRD §2.7 是否补「state-transition 第 9 类事件」**:由 PM 决定;知识库已注明「8+1」并提示 PRD 待校准。
- [文档] **knowledge 各篇 Pending 区**:scene-select 等其他 Skill 接入后再回填。

## 下一阶段建议

1. **scene-select + practice + grade 学习闭环**(PRD §2.1 + §2.5)— onboarding 已通,新用户立刻能选场景练题。先做半句翻译题型(implementation cost 最低)打通「场景→出题→批改→更新掌握度」首版闭环,跑通 mastery_records / error_tag_events 写入。重点在 grade skill 自产 state-transition 替换 chat.ts 兼容分支。
2. **辅助追问支线**(PRD §3.2 + branch_threads 表)— 主流稳定后补支线,实现 `source_ref` 携带 + 锁定题前不漏答案。这是 Echora 区别于普通 chat 的关键体验,需在主流稳定后做以避免双流互相干扰。
3. **会话锁定与防抄袭**(PRD §3.1 + lock_policy)— 学习闭环跑通后,在 practicing/grading 期间隐藏历史详情,reviewing/awaiting_next 自动恢复。状态机基础已就位,只差服务层根据 learning_state 控制返回字段。
4. **12 Widget React 组件批量实现**(PRD §4.7)— 学习闭环 + 支线落地后,按原型 doc/design/widgets/ 拆出 12 组件,统一接 chat.activeWidgets。优先 scene-cards / exercise-card / grading-result(主流必需)。
5. **EventSource → fetch+ReadableStream**(PRD §1.4 + 安全)— 消除 ?token= URL 泄露,生产化前必做。同时实现取消逻辑(stop generating 按钮)。
