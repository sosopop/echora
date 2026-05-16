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

### 补丁(commit 7 · 解锁手工验证)
- `src/views/Login/index.tsx` — 替换占位为真实表单(email + password,wire useAuthStore.login,error 显示,登录中禁用)
- `src/views/Register/index.tsx` — 替换占位为真实表单(email + password + confirm,密码长度校验,wire useAuthStore.register)
- `scripts/diag-anthropic.ts` — 直接调 AnthropicProvider.route() 诊断 endpoint / token / 模型,绕开 createAIRouter 的 fallback 屏蔽
- `scripts/diag-stub.ts` — 同上但用 stub provider,验证降级路径
- `CLAUDE.md` + `doc/knowledge/task-handoff.md` — 任务文档结构从 4 段升 5 段,新增「手工测试」强约束

### 补丁(commit 8 · OpenAI Provider + 删除 fallback)
- `server/ai/providers/openai.ts` — OpenAIProvider 真实接入(route 用 function calling + tool_choice 强制 JSON;chat 用 chat.completions.create stream 转 ChatStreamEvent)
- `server/ai/providers/index.ts` — 新增 `openai` 分支;**移除 fallback**:缺 key 直接抛错,不再悄悄降级到 stub
- `server/ai/router.ts` — **移除 try/catch fallback**:provider.route 抛错直接传播;新增 `RouterValidationError`(reason: skill_not_found / state_not_allowed)
- `server/routes/chat.ts` — `/api/chat/send` 在 router.decide() 抛错时返 `502 PROVIDER_ERROR`(含原始错误消息),让客户端看到具体原因
- `server/config/getConfig.ts` — `AIProviderKind` 加 `'openai'`;新增 `openaiApiKey` / `openaiBaseURL`(默认 `https://api.openai.com/v1`)/ `openaiModel`(默认 `gpt-4o-mini`)
- `tests/smoke/run-smoke-ai.ts` — 严格双 Provider 烟雾(preflight 检查所有 key,缺即报错);测每个 provider 的 route() + chat()(含 tool-use 验证)
- `scripts/diag-openai.ts` — 独立诊断入口
- `server/__tests__/ai-router.test.ts` — 5 测试覆盖正常路径 + 3 类失败路径(provider 抛 / skill 不存在 / state 不允许)+ 空 allowedStates 任意态
- `package.json` — 新增 `npm run test:smoke:ai` 脚本;新增 `openai ^6.38` 依赖
- `.env.example` — 增 OpenAI 三项 + fallback 关闭说明
- CLAUDE.md + `doc/knowledge/skills.md` — 同步 OpenAI Provider 与「无 fallback」约定

### 验证结果

| 命令 | 结果 |
|---|---|
| `npx tsc -p tsconfig.server.json --noEmit` | ✓ 后端类型干净 |
| `npx tsc -p tsconfig.json --noEmit` | ✓ 前端类型干净 |
| `npm run test:server` | ✓ 18 passed (5 suites,新增 ai-router) |
| `npm run test:web` | ✓ 16 passed (3 suites) |
| `npm run test:smoke` | ✓ 6/6 (stub provider 全链) |
| `npm run test:smoke:ai` | ⚠ 需 ANTHROPIC_API_KEY + OPENAI_API_KEY 双备 才能跑完整链(详见「手工测试 · test:smoke:ai」) |
| 手工 curl(stub provider) | ✓ register → /me → profile CRUD → send → SSE 全链 |
| 手工 curl(anthropic provider) | ⚠ 链路完整但 `provider.route` 在第三方中转 endpoint 上 401,**现已不再 fallback**:`/api/chat/send` 直接返 502(详见「手工测试 · 诊断记录」) |

## 手工测试

> 命令块均为可直接复制粘贴的形式(不含 `$` `>` 等 shell 提示符)。
> 凭据/动态变量用占位符:`<TOKEN>` `<EMAIL>` `<CONV_ID>` `<STREAM_ID>`,前文有获取方式。

### 后端 API · stub provider(基线)

`tests/smoke/run-smoke.ts` 已覆盖 stub 全链 6 步(register / profile-empty / profile-update / me / send / stream),直接跑 smoke 即可:

命令:

```bash
npm run test:smoke
```

输出:

```
[smoke] 服务已启动 http://127.0.0.1:<random>
[smoke] ✓ register (128ms)
[smoke] ✓ profile-empty (6ms)
[smoke] ✓ profile-update (3ms)
[smoke] ✓ me-onboarding-completed (3ms)
[smoke] ✓ send (5ms)
[smoke] ✓ stream (124ms)
[smoke] PASSED 6/6
```

### 后端 API · anthropic provider(真实接入)

前置:`.env` 设 `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL`,然后另开终端跑:

```bash
npm run dev
```

后端应 listen 在 `http://localhost:8787`。

#### Step 1 · register

命令(bash · POSIX shell):

```bash
curl -s -X POST http://127.0.0.1:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"manualtest@echora.dev","password":"echora-manual-12345"}'
```

命令(PowerShell):

```powershell
$body = @{ email='manualtest@echora.dev'; password='echora-manual-12345' } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8787/api/auth/register -Method Post -ContentType 'application/json' -Body $body
```

响应:

```json
{"data":{"token":"<TOKEN>","user":{"id":2,"email":"manualtest@echora.dev"}}}
```

✓ 返回 token + user;同事务 `ensureProfile` 已建空 profile 行。**把 `token` 的值记为 `<TOKEN>` 供后续步骤使用**。

#### Step 2 · GET /api/profile(应为空)

命令:

```bash
curl -s -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8787/api/profile
```

响应:

```json
{"data":{"userId":2,"name":null,"age":null,"grade":null,"level":null,"weaknessTags":[],"recentTopics":[],"createdAt":"2026-05-16 07:53:58","updatedAt":"2026-05-16 07:53:58"}}
```

✓ name/level 为 null,数组为 `[]`,符合 `ensureProfile` 默认值。

#### Step 3 · GET /api/auth/me(onboardingCompleted=false)

命令:

```bash
curl -s -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8787/api/auth/me
```

响应:

```json
{"data":{"id":2,"email":"manualtest@echora.dev","profile":{...},"onboardingCompleted":false}}
```

✓ MeResp 含 profile,`onboardingCompleted=false`,前端 RouteGuard 据此跳 /onboarding。

#### Step 4 · 新建 onboarding 会话

命令:

```bash
curl -s -X POST http://127.0.0.1:8787/api/chat/conversations \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"learningState":"onboarding"}'
```

响应:

```json
{"data":{"id":1,"title":null,"status":"active","learningState":"onboarding","activeSkill":null,"inputMode":"chat","lockPolicy":"open","createdAt":"2026-05-16 07:54:12","updatedAt":"2026-05-16 07:54:12","archivedAt":null}}
```

✓ `POST /api/chat/conversations` 接受 `learningState` body。**把 `id` 的值记为 `<CONV_ID>`**。

#### Step 5 · POST /api/chat/send(触发 router → onboarding skill)

命令:

```bash
curl -i -X POST http://127.0.0.1:8787/api/chat/send \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":<CONV_ID>,"text":"hi"}'
```

响应(本次实测,中转 endpoint 401,**已不再 fallback,直接返 502**):

```
HTTP/1.1 502 Bad Gateway
Content-Type: application/json
```

```json
{"error":{"code":"PROVIDER_ERROR","message":"AI 路由失败: 401 {\"error\":{\"code\":\"\",\"message\":\"无效的令牌 (request id: ...)\",\"type\":\"new_api_error\"}}"}}
```

⚠ **设计意图**(002 patch):router 不再 catch 错误降级。前端 chat store / Login / Register 上拿到 502 即可显示真实失败原因(`PROVIDER_ERROR: AI 路由失败: 401 ...`),不再被假装成 general-chat 的「我收到啦」掩盖。Provider 正常时此步返 202 + streamId,后续 SSE 流出真实 LLM 文本 + tool_use 调用。

#### Step 6 · GET /api/chat/stream(SSE,仅 Step 5 成功时执行)

> Step 5 已 502 时跳过本步骤(无 streamId)。Provider 通时:

命令:

```bash
curl -N "http://127.0.0.1:8787/api/chat/stream?streamId=<STREAM_ID>&lastSeq=0&token=<TOKEN>"
```

输出(provider 通时,onboarding skill 真实流):

```
data: {"type":"text-chunk","payload":{"text":"你好!我叫 Echo,"},"seq":1,...}

data: {"type":"text-chunk","payload":{"text":"先问下你叫什么?"},"seq":2,...}

data: {"type":"state-transition","payload":{"nextLearningState":"scene_selecting","activeSkill":null},"seq":N,...}

data: {"type":"done","payload":{},"seq":N+1,...}
```

✓ SSE 协议工作正常,事件按 seq 单调,`done` 后流关闭。state-transition 在所有必填字段齐全后触发。

### test:smoke:ai · 双 Provider 真实接入烟雾

严格模式:任一 Provider API key 未配置即 preflight 报错退出。

命令:

```bash
npm run test:smoke:ai
```

输出(本次实测,缺 OPENAI_API_KEY):

```
[smoke:ai] ✗ 严格模式:缺以下环境变量,无法进行 AI provider 测试
[smoke:ai]   - OPENAI_API_KEY
[smoke:ai] 提示:在 .env 中配置 ANTHROPIC_API_KEY / OPENAI_API_KEY,或临时把对应的 RUN_* 改为 false 跳过
```

⚠ 预期行为。完整跑通需要两个 key 都配齐;若只想测一个 provider,改 `tests/smoke/run-smoke-ai.ts` 顶部的 `RUN_ANTHROPIC` / `RUN_OPENAI` 常量。

完整跑通时(provider 都正常)期望输出:

```
[smoke:ai] === Anthropic Provider ===
[smoke:ai]   baseURL=... model=...
[smoke:ai] === OpenAI Provider ===
[smoke:ai]   baseURL=... model=...

[smoke:ai] === Results ===
[smoke:ai] ✓ anthropic/route: skillName=general-chat confidence=0.85
[smoke:ai] ✓ anthropic/chat: textDelta=12 toolUse=1 input={"name":"张三"}
[smoke:ai] ✓ openai/route: skillName=general-chat confidence=0.80
[smoke:ai] ✓ openai/chat: textDelta=8 toolUse=1 input={"name":"张三"}
[smoke:ai] PASSED 4/4
```

### 诊断记录 · Anthropic 401

- **现象**:Step 5 中 `/api/chat/send` 返 `502 PROVIDER_ERROR`,错误消息含 `401 无效的令牌`。Provider 没有被 fallback 隐藏,客户端直接看到根因
- **诊断**:运行 `scripts/diag-anthropic.ts` 绕开 router 直接调 provider.route():

  命令:

  ```bash
  npx tsx scripts/diag-anthropic.ts
  ```

  输出:

  ```
  [diag] AI_PROVIDER = anthropic
  [diag] ANTHROPIC_BASE_URL = https://api.code-relay.com
  [diag] ANTHROPIC_MODEL = claude-opus-4-7
  [diag] ANTHROPIC_API_KEY = sk-01a02f4...
  [diag] route() 测试...
  [diag] ✗ route 失败:
  AuthenticationError: 401 {"error":{"code":"","message":"无效的令牌 (request id: 20260516075453177060663lwDgAMAF)","type":"new_api_error"}}
  ```

- **根因**:用户配置的 `ANTHROPIC_BASE_URL` 是第三方中转 `https://api.code-relay.com`(one-api / oneapi 类网关),它返回 `401 无效的令牌`。中转网关通常要求自己签发的 token,而不是 Anthropic 原生 `sk-ant-*`;或 token 已过期 / 配额耗尽
- **处置**:不属于本次代码缺陷。建议用户:
  1. 确认 `ANTHROPIC_API_KEY` 是 code-relay.com 控制台签发的有效 token(不是 Anthropic 原生 key)
  2. 或临时把 `ANTHROPIC_BASE_URL` 改回默认 `https://api.anthropic.com` + 用原生 sk-ant-* key 验证 SDK 接入本身没问题
  3. 验证后 `route()` 应返回 `{skillName: 'onboarding', confidence: 0.85+, ...}`,SSE 流应是真实 LLM 文本 + tool_use 调用
- **fallback 已删除**(002 patch 8):即使 provider 完全不通,系统不再悄悄降级。`/api/chat/send` 直接 502,前端能看到 `PROVIDER_ERROR` 与具体的 SDK 错误消息(401 / 404 / 网络超时等)

### 诊断记录 · OpenAI 未配置

- **现象**:`test:smoke:ai` 预检退出 / `diag-openai` 报「OPENAI_API_KEY 未配置」
- **处置**:在 `.env` 中配置 `OPENAI_API_KEY` + 可选 `OPENAI_BASE_URL` / `OPENAI_MODEL`(默认 `https://api.openai.com/v1` + `gpt-4o-mini`)
- **诊断命令**:

  ```bash
  npx tsx scripts/diag-openai.ts
  ```

### Stub Provider 诊断(参考)

命令:

```bash
npx tsx scripts/diag-stub.ts
```

输出:

```
AI_PROVIDER override = stub
provider.name = stub
stub route decision: {"skillName":"general-chat","params":{},"confidence":0.6,"rationale":"stub provider 默认路由"}
```

✓ Stub provider 不依赖网络,任何环境均可跑通。

### 前端 UI(浏览器)

前置:同上后端 + 另开终端跑前端:

```bash
npm run dev:web
```

前端在 `http://localhost:5173`。

1. 访问 `http://localhost:5173/` → RouteGuard 检测未登录 → 跳 `/login`
2. 看到「欢迎回来」表单:邮箱 + 密码 + 登录按钮
3. 点击底部「立即注册」链接 → 跳 `/register`
4. 看到「创建账号」表单:邮箱 + 设置密码 + 确认密码 + 创建账号按钮
5. 填写 email + password(≥ 8 位)+ 同样的 confirm,点「创建账号」
6. ✓ register 调用成功 → token 写入 localStorage.echora_token → profile.load 拉到空 profile → RouteGuard 检测 `onboardingCompleted=false` → 自动跳 `/onboarding`
7. ✓ Onboarding 视图渲染:顶部进度条(0/3 当前·姓名)+ 中间标题「先认识一下,我是 Echo」+ 空 pills + 底部输入框(disabled,因为 Echo 正在回复)
8. ✓ mount useEffect 自动 create onboarding 会话 + sendMessage('hi') → SSE 流开始 → Echo 消息出现(stub 时为「我收到啦...」,真实 anthropic 时为 LLM 回应问候 + 询问姓名)
9. (anthropic 通时)输入「我叫小李」回车 → AI 回应 + tool_use 落 name → ProfilePills 出现「姓名 小李」+ 进度条第一段变实
10. (anthropic 通时)继续答年级、英语水平 → 全齐后 state-transition 触发 → chat store 自动 reload profile → RouteGuard 检测 `isOnboardingComplete=true` → 跳 `/chat`
11. 刷新页面 → 仍在 `/chat`(token + profile 都已就位)

**负样本**:
- 密码不一致 → 表单本地 error「两次输入的密码不一致」,不发请求
- 密码 < 8 位 → 本地 error「密码至少 8 位」+ 浏览器 `minLength` 阻断
- 邮箱已存在 → store error「该邮箱已注册」(从 backend 409 透传)

### 总结

- **stub provider 全链跑通**:6/6 自动化 smoke + 6 步后端 curl 已验证
- **anthropic provider 链路完整但被外部 401 阻断**:不属于本次代码缺陷;`scripts/diag-anthropic.ts` 已提供随时诊断入口
- **路由守卫与表单符合预期**:RouteGuard 矩阵 8 测试全过,Login/Register 表单可正常提交
- **UI 11 步流程**:框架就位可走通,真实 LLM 体验依赖用户修复 endpoint token 后复测

## 遗留 TODO

### 后端
- [后端] **grade skill 自身 yield state-transition**:目前由 `chat.ts` 兼容分支硬编码 `if (skill.name === 'grade') updateLearningState(..., 'awaiting_next', null)`。grade skill 003 真实接入后须自产 state-transition,删除兼容分支。
- [后端] **其余 7 Skill 仍 stub**:onboarding 已真实接入;scene-select / practice / grade / explain / review / retry / general-chat 仍是 stub 文本流。
- [后端] **AI Router 低置信度处理**:`route()` 返回 confidence 但当前未触发 intent-confirm widget。<0.5 应弹出选项确认,而不是直接执行 skill。
- [后端] **Onboarding kickoff 消息隐藏**:用户当前可见自己说了「hi」,后续协议需要 `meta.kind='kickoff'` 让前端跳过渲染。
- [后端] **OpenRouter / Bedrock 等替代 endpoint 验证**:`ANTHROPIC_BASE_URL` 配置已支持但仅 stub + 用户的 code-relay 中转(401)跑过,默认 endpoint + 原生 key 未实测。
- [后端] **AI Provider 错误日志细化**:模型 ID 错配 / token 401 时仅 catch 后降级,未给运维友好提示。dev-server.js 的 stdio:'inherit' 模式下 console.warn 也不易抓到,可考虑改 pipe 模式。

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
