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

### 补丁(commit 9 · DeepSeek 兼容 + 交互式手工测试脚本)
- `server/ai/providers/deepseek.ts` — 新增 helper:`isDeepSeekBaseURL()` 检测 + `DEEPSEEK_THINKING_DISABLED` 常量(给 route() 加 `thinking: { type: 'disabled' }`,绕开 `deepseek-reasoner` 不支持 `tool_choice` 强制的限制)
- `server/ai/providers/anthropic.ts` + `openai.ts` — 构造时检测 baseURL,DeepSeek endpoint 自动给 route() 请求加 thinking 禁用参数;chat() 不影响
- `package.json` 脚本 `smoke:ai` 改名为 **`test:smoke:ai`** 与其他测试命令对齐
- `doc/task/002-test.py` — 新增**交互式手工测试脚本**(stdlib only,Windows + POSIX 兼容):自动跑 6 步 curl 等价请求,自动占位替换(TOKEN / conv_id / stream_id),每步打印完整输入/输出后按空格继续。`python doc/task/002-test.py` 即可一键复测
- `doc/knowledge/task-handoff.md` + `CLAUDE.md` — 写入新约定:有 ≥ 3 步 curl 测试的 task 文档须配套 `<NNN>-test.py` 脚本,与文档同步

### 补丁(commit 10 · onboarding 端到端确定性 smoke)
- `tests/smoke/_helpers/testApp.ts` — 抽出公共 testApp 装配(独立 DB + 独立端口),被现有 run-smoke 与新脚本共享
- `tests/smoke/_helpers/scriptedProvider.ts` — 可脚本化 mock AIProvider:routeFn 注入决策,chatScripts 按子串匹配 yield 预录事件,disableChat 模拟 PROVIDER_CHAT_UNAVAILABLE 路径
- `tests/smoke/run-smoke-onboarding.ts` — 10 场景端到端:A 完整多轮 / B 短路 / C 不调工具 / D 非法 CEFR / E disableChat / F state_not_allowed / G route 抛错 / H lastSeq 续传 / I 学习态转移后 / J orphan 快照
- `server/skills/_helpers/onboardingFsm.ts` — 字段拆分:`decideMissingRequired`(仅 name+level,决定是否短路)+ `decidePromptMissingFields`(必填+grade,prompt 措辞用),解决之前 `decideMissingFields` 把 grade 当必填问的不一致
- `server/skills/onboarding.ts` — 调用 `decidePromptMissingFields`(prompt)与 `isOnboardingComplete`(短路),清晰区分两种判定
- `package.json` — 新增 `npm run test:smoke:onboarding` 脚本;`npm test` 全量含此场景
- `CLAUDE.md` + `doc/knowledge/skills.md` — 同步测试入口

### 验证结果(commit 10 后)

| 命令 | 结果 |
|---|---|
| `npx tsc -p tsconfig.server.json --noEmit` | ✓ 后端类型干净 |
| `npx tsc -p tsconfig.json --noEmit` | ✓ 前端类型干净 |
| `npm run test:server` | ✓ 21 passed (6 suites) |
| `npm run test:web` | ✓ 16 passed (3 suites) |
| `npm run test:smoke` | ✓ 6/6 (stub provider 全链) |
| `npm run test:smoke:onboarding` | ✓ **10/10**(确定性 mock,端到端) |
| `npm run test:smoke:ai` | ✓ 4/4(双 Provider 实测,DeepSeek 中转) |
| `npm test` | ✓ 全量(server + web + smoke + smoke:onboarding) |
| 手工 curl(stub provider) | ✓ register → /me → profile CRUD → send → SSE 全链 |
| 手工 curl(anthropic provider via DeepSeek) | ✓ Provider 接入打通 |

## 手工测试

> 命令块均为可直接复制粘贴的形式(不含 `$` `>` 等 shell 提示符)。
> 凭据/动态变量用占位符:`<TOKEN>` `<EMAIL>` `<CONV_ID>` `<STREAM_ID>`,前文有获取方式。
> **一键复测**:`python doc/task/002-test.py` — 等价于把下方 6 步 curl 串起来跑,自动占位替换,每步空格继续。

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

响应(provider 正常,实测使用 DeepSeek 中转):

```
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{"data":{"conversationId":1,"userMessageId":1,"assistantMessageId":2,"streamId":"<STREAM_ID>","decision":{"skillName":"onboarding","confidence":0.95,"rationale":"onboarding 学习态下用户首次互动,选 onboarding skill"}}}
```

✓ Router 调用 LLM 成功,返回 `skillName=onboarding`。**把 `streamId` 的值记为 `<STREAM_ID>`**。

负样本(provider 不可达,例如 token 失效):返 `502 PROVIDER_ERROR`,带原始 SDK 错误消息。**无 fallback** — 客户端能直接看到根因。

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

### test:smoke:onboarding · Onboarding 工作流确定性 E2E

10 个场景串联跑,无外部依赖,完全可重复。脚本注入 ScriptedProvider(可脚本化的 mock AIProvider),走真实 HTTP + chat.ts 背景任务 + SSE 全链。

命令:

```bash
npm run test:smoke:onboarding
```

输出(实测):

```
[smoke:onb] === 10 scenarios ===

[smoke:onb] ✓ A 完整多轮(从空到完成) (359ms)
[smoke:onb] ✓ B 短路(profile 已齐时不调 LLM 直接转场) (171ms)
[smoke:onb] ✓ C AI 不调工具时不写库不转场 (161ms)
[smoke:onb] ✓ D 工具入参非法 CEFR 被 mergeProfileFields 过滤 (171ms)
[smoke:onb] ✓ E provider.chat 不实现时 yield error (163ms)
[smoke:onb] ✓ F router 拒绝非法 state(无 fallback,直接 502) (78ms)
[smoke:onb] ✓ G provider.route 抛错时直接 502(无 fallback) (78ms)
[smoke:onb] ✓ H SSE 断线后用 lastSeq 续传 ring buffer 事件 (477ms)
[smoke:onb] ✓ I state-transition 后下次 send 路由到 scene-select (241ms)
[smoke:onb] ✓ J /send 502 时 user 消息已落库但无 assistant(行为快照) (78ms)

[smoke:onb] PASSED 10 / 10
```

✓ 所有场景通过。覆盖正常多轮路径 + 短路 + 模糊输入 + 字段过滤 + provider 不实现 chat + 状态校验拒绝 + provider 抛错 + SSE 续传 + 学习态转移 + orphan 行为快照。

**与 smoke:ai 的区分**:
- `smoke:onboarding`:**HTTP + chat.ts 系统层** + 确定性 mock,场景覆盖完整,任何回归都会被门禁卡住,**纳入 `npm test` 全量门禁**
- `smoke:ai`:**真实 Provider 接口契约**,验 SDK 调用对接,需 API key,**不**入门禁,按需手动跑
- 两者互补,前者系统层守门,后者 endpoint 兼容性验证

### test:smoke:ai · 双 Provider 真实接入烟雾

严格模式:任一 Provider API key 未配置即 preflight 报错退出。

命令:

```bash
npm run test:smoke:ai
```

输出(实测,双 Provider 配 DeepSeek 中转 + `deepseek-v4-flash` 模型):

```
[smoke:ai] === Anthropic Provider ===
[smoke:ai]   baseURL=https://api.deepseek.com/anthropic model=deepseek-v4-flash
[smoke:ai] === OpenAI Provider ===
[smoke:ai]   baseURL=https://api.deepseek.com model=deepseek-v4-flash

[smoke:ai] === Results ===
[smoke:ai] ✓ anthropic/route: skillName=onboarding confidence=0.95
[smoke:ai] ✓ anthropic/chat: textDelta=7 toolUse=1 input={"name":"张三"}
[smoke:ai] ✓ openai/route: skillName=onboarding confidence=0.90
[smoke:ai] ✓ openai/chat: textDelta=7 toolUse=1 input={"name":"张三"}
[smoke:ai] PASSED 4/4
```

✓ 两个 provider 的 route() + chat() + tool_use 全部跑通,`skillName=onboarding` 与 `tool_use input={name:'张三'}` 符合契约。

#### DeepSeek 中转兼容性说明

DeepSeek 的 `deepseek-reasoner` 模型在 `tool_choice` 强制场景下需要禁用 thinking 模式,否则返 400「does not support this tool_choice」。`server/ai/providers/deepseek.ts` 提供 `isDeepSeekBaseURL()` 与 `DEEPSEEK_THINKING_DISABLED` 常量,两个 Provider 在构造时检测 baseURL,DeepSeek endpoint 自动给 `route()` 请求加 `thinking: { type: 'disabled' }` 参数。`chat()` 不需要(可以让模型继续 thinking)。

### 诊断记录

#### 现在(provider 已通)

无活动诊断;`scripts/diag-anthropic.ts` 与 `scripts/diag-openai.ts` 任意时刻可跑,提供绕开 router 的直接诊断入口。

命令:

```bash
npx tsx scripts/diag-anthropic.ts
npx tsx scripts/diag-openai.ts
```

#### 历史 · DeepSeek 中转 401(已修复)

最早实测时 `ANTHROPIC_BASE_URL=https://api.code-relay.com` 返回 `401 无效的令牌`。原因:中转网关签发的 token 与配置 endpoint 不匹配。处置:改用 `https://api.deepseek.com/anthropic` 路径 + DeepSeek 控制台签发的 token,问题解决。

教训:**无 fallback** 设计让此问题第一时间暴露 — `/api/chat/send` 直接返 502 + 完整 SDK 错误消息,不再被假装成 general-chat 的回复掩盖。

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
- **anthropic + openai 双 provider 已通**(via DeepSeek 中转 + `deepseek-v4-flash` 模型):`test:smoke:ai` 4/4,UI 11 步流程也可走真实 LLM
- **路由守卫与表单符合预期**:RouteGuard 矩阵 8 测试全过,Login/Register 表单可正常提交
- **DeepSeek 兼容补丁**:`server/ai/providers/deepseek.ts` 检测到 DeepSeek baseURL 时,给 `route()` 自动加 `thinking: { type: 'disabled' }`,绕开 `deepseek-reasoner` 不支持 `tool_choice` 强制的限制
- **交互式手工测试脚本**:`doc/task/002-test.py` 一键跑全套 curl 步骤,自动占位替换,每步空格确认

## 遗留 TODO

### 后端
- [后端] **grade skill 自身 yield state-transition**:目前由 `chat.ts` 兼容分支硬编码 `if (skill.name === 'grade') updateLearningState(..., 'awaiting_next', null)`。grade skill 003 真实接入后须自产 state-transition,删除兼容分支。
- [后端] **其余 7 Skill 仍 stub**:onboarding 已真实接入;scene-select / practice / grade / explain / review / retry / general-chat 仍是 stub 文本流。
- [后端] **AI Router 低置信度处理**:`route()` 返回 confidence 但当前未触发 intent-confirm widget。<0.5 应弹出选项确认,而不是直接执行 skill。
- [后端] **Onboarding kickoff 消息隐藏**:用户当前可见自己说了「hi」,后续协议需要 `meta.kind='kickoff'` 让前端跳过渲染。
- [后端] **OpenRouter / Bedrock 等其他替代 endpoint 验证**:`ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` 已支持自定义,DeepSeek 中转通过,但 OpenRouter / Bedrock / 直连官方 endpoint 未实测。
- [后端] **AI Provider 错误日志细化**:dev-server.js 的 stdio:'inherit' 模式下 console.warn 不易抓到,可考虑改 pipe 模式或换 pino 结构化日志。

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
