# API Contract

## 入口

- 路由装配:`server/createApp.ts`
- 错误响应格式:`server/middleware/error.ts`
- 错误码常量:`shared/errors.ts`
- DTO 类型:`shared/api.ts`

## 关键源码

### 鉴权(`server/routes/auth.ts`)

| Method | Path                | 说明                            |
|--------|---------------------|---------------------------------|
| POST   | /api/auth/register  | { email, password } → token+user|
| POST   | /api/auth/login     | { email, password } → token+user|
| GET    | /api/auth/me        | (需 token) → user               |

JWT 7 天过期,V1 无刷新令牌。密钥来自 `JWT_SECRET`。

### 会话与流(`server/routes/chat.ts`)

| Method | Path                                       | 说明                              |
|--------|--------------------------------------------|-----------------------------------|
| GET    | /api/chat/conversations                    | 当前用户会话列表                   |
| POST   | /api/chat/conversations                    | 新建空会话                         |
| GET    | /api/chat/conversations/:id/messages       | 历史消息                           |
| POST   | /api/chat/send                             | 发消息 → { messageId, streamId, decision } |
| GET    | /api/chat/stream?streamId=&lastSeq=&token= | SSE 端点                           |

## SSE 协议

- Content-Type: `text/event-stream`
- 每事件:`data: <JSON>\n\n`
- JSON shape:`SkillEvent`(`shared/skill.ts`,8 类型联合 + seq/streamId/timestamp 元数据)
- 心跳:每 15s 注释行 `: ping`
- 重连:客户端用最新 `lastSeq` 续传,后端从 ring buffer(每流 200 条)replay

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
