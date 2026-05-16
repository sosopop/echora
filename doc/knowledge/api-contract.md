# API Contract

## 入口

- 路由装配:`server/createApp.ts`
- 错误响应格式:`server/middleware/error.ts`
- 错误码常量:`shared/errors.ts`
- DTO 类型:`shared/api.ts`

## 关键源码

### 鉴权(`server/routes/auth.ts`)

| Method | Path                | 说明                                                           |
|--------|---------------------|----------------------------------------------------------------|
| POST   | /api/auth/register  | { email, password } → token+user;同事务 `ensureProfile`        |
| POST   | /api/auth/login     | { email, password } → token+user                               |
| GET    | /api/auth/me        | (需 token) → { id, email, profile, onboardingCompleted }       |

`/me` 的 `onboardingCompleted` = `!!(profile.name && profile.level)`,前端 RouteGuard 用此字段决策是否跳转 onboarding。

JWT 7 天过期,V1 无刷新令牌。密钥来自 `JWT_SECRET`。

### 用户画像(`server/routes/profile.ts`,002 新增)

| Method | Path           | 说明                                              |
|--------|----------------|---------------------------------------------------|
| GET    | /api/profile   | 当前用户画像(不存在自动 ensure 空行)             |
| PUT    | /api/profile   | partial 更新;`level` 只接受 CEFR(A1-C2)          |

请求/响应 DTO:`shared/api.ts` 中 `ProfileDTO` / `ProfileUpdateReq`。

### 会话与流(`server/routes/chat.ts`)

| Method | Path                                       | 说明                              |
|--------|--------------------------------------------|-----------------------------------|
| GET    | /api/chat/conversations                    | 当前用户会话列表                   |
| POST   | /api/chat/conversations                    | 新建空会话(可选 `learningState`)|
| GET    | /api/chat/conversations/:id/messages       | 历史消息                           |
| GET    | /api/chat/conversations/:id/scene-dialogue | 当前活跃 scene_dialogue(003 新增)|
| POST   | /api/chat/send                             | 发消息 → { messageId, streamId, decision } |
| GET    | /api/chat/stream?streamId=&lastSeq=&token= | SSE 端点                           |

POST `/api/chat/conversations` body 可选 `{ learningState?: LearningState, title?: string }`,Onboarding 视图传 `learningState='onboarding'`。

POST `/api/chat/send` body(003 起 text 与 action 二选一):

```ts
{
  conversationId?: number;
  text?: string;          // 与 action 二选一
  action?: ChatAction;    // 与 text 二选一
  mode?: InputMode;
}

type ChatAction =
  | { type: 'select-scene'; payload: { sceneId } }
  | { type: 'request-new-scenes' }
  | { type: 'submit-answer'; payload: { attemptId, answer } }
  | { type: 'skip-question'; payload: { attemptId } }
  | { type: 'next-question' };
```

`action` 与 `text` 二选一,zod refine 校验。前端 widget 交互(点击场景卡片、提交答案、下一题等)统一走 `action` 路径。007 起 action 不再交给 AI Router,而是由后端确定性映射到 Skill:`request-new-scenes` / `select-scene` → `scene-select`,`submit-answer` → `grade`,`next-question` / `skip-question` → `practice`;随后仍校验目标 Skill 是否允许当前 `learningState`。

008 起,`practicing` 态下的自由文本会先检查当前会话最新 attempt:若最新题仍是 `pending/submitted`,或已 `graded` 但结果错误且 `retry_count < 2`,后端会把非控制指令文本规范化为 `submit-answer` action 并走 `grade`。010 起 answer 绑定只看当前活跃 `scene_dialogue.sceneId` 下的 latest attempt,避免换场景后误提交旧场景题目。`出题` / `开始练习` / `继续` / `下一题` / `go` / `next` 等继续指令在 `practicing` 中确定性映射为 `next-question`,`awaiting_next` / `scene_selecting` / `reviewing` 中映射为 `request-new-scenes`;012 起 `换场景` / `换一批` / `重新生成场景` 在 `practicing` 中也确定性映射为 `request-new-scenes`,避免绕回 AI Router 或被误判为答案。

006 起,结构化 `action` 在消息历史中显示为自然文案,不再暴露 `[action] {...}` 原始 JSON。008 起 `submit-answer` 显示用户真实答案,其他映射保持:`request-new-scenes` → "换一批场景",`select-scene` → "选择场景:<sceneId>",`skip-question` → "跳过本题",`next-question` → "下一题"。前端仍兼容历史 raw action 消息,渲染时会转为同一套文案。

## SSE 协议

- Content-Type: `text/event-stream`
- 每事件:`data: <JSON>\n\n`
- JSON shape:`SkillEvent`(`shared/skill.ts`,**9 类型**联合 + seq/streamId/timestamp 元数据;002 起新增 `state-transition`)
- 心跳:每 15s 注释行 `: ping`
- 重连:客户端用最新 `lastSeq` 续传,后端从 ring buffer(每流 200 条)replay

## AI Provider 配置

`AI_PROVIDER=stub`(默认):零配置启动,所有 route 命中 general-chat。
`AI_PROVIDER=anthropic`:接入真实 Anthropic SDK,需要:

| env | 默认值 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (无) | 必填,空时降级到 stub |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | 自定义网关或中转(如 OpenRouter / Bedrock) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | 调用模型 ID |

`route()` 用 `tool_use` 强制 AI 输出结构化 RouterDecision(`route_to_skill` 工具)。
`chat()` 用 `messages.stream` 转换为 ChatStreamEvent(text-delta / tool-use / message-stop)。

## 响应格式

成功:
```json
{ "data": { ... } }
```

失败:
```json
{ "error": { "code": "ERROR_CODE", "message": "...", "details": { ... } } }
```

`NODE_ENV !== 'production'` 时,HTTP 错误响应会在 `details.debug` 或 `details.upstream` 中附带错误 name/message/stack 与上游状态码等调试字段;前端 dev 模式会在控制台打印完整 API/SSE 错误并把 details 拼进错误提示。生产环境不附带这些调试细节。

前端发送顺序(008):`useChatStore.sendMessage/sendAction` 会在 `/api/chat/send` 返回前先插入临时用户消息与空 assistant 消息;assistant 空流式消息渲染为 "Echo 正在思考中..."。服务端返回后再替换真实 messageId 并连接 SSE,随后 `text-chunk` / `widget-*` 覆盖为真实 AI 输出或小部件结果。

## 约束与失败点

- **EventSource 不支持自定义 Header**:SSE token 走 `?token=` 查询参数,V1 接受 URL 日志泄露风险,生产化前迁 fetch + ReadableStream
- **Express 5 SSE 资源泄漏**:必须 `req.on('close', () => streamBus.unsubscribe(...))`,否则订阅累积
- **CORS**:`CORS_ORIGIN` 默认 `http://localhost:5173`,多域用逗号分隔

## 测试入口

- supertest 在 `server/__tests__/` 下针对每个路由组写一个 `*.test.ts`
- E2E 在 `tests/smoke/run-smoke.ts` 覆盖完整链路

## Pending

- 错误响应是否需要 traceId 字段
- SSE 是否需要 Last-Event-ID 标准头(EventSource 自动支持)
