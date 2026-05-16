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
| POST   | /api/chat/send                             | 发消息 → { messageId, streamId, decision } |
| GET    | /api/chat/stream?streamId=&lastSeq=&token= | SSE 端点                           |

POST `/api/chat/conversations` body 可选 `{ learningState?: LearningState, title?: string }`,Onboarding 视图传 `learningState='onboarding'`。

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
