> 日期: 2026-05-18
> 序号: 048
> 任务: 整理并收敛 PRD 剩余缺口

## 任务背景

用户要求把 `@doc/prd-gap-audit.md` 中的缺口逐条推进,并在完成后删掉已收口条目。当前先完成一轮“缺口审计 + 部分收口”,为后续继续实现 SSE 现代化和归档复用边界留出清晰基线。

## 执行摘要

- `server/ai/providers/stub.ts` — 为 stub provider 补充 `chat()` 实现,开发态也能输出自然闲聊,不再只剩规则化 fallback。
- `server/createApp.ts` — 增加请求级 `traceId` 生成与透传,统一写入 `X-Request-Id` 响应头。
- `server/middleware/auth.ts` — 鉴权失败响应补充 `traceId`,便于把 401/403 与请求链路对上。
- `server/middleware/error.ts` — 全局错误响应补充 `traceId`。
- `server/routes/chat.ts` — `agent_runs.payload` 持续记录 `traceId`、`finalSeq`、`textLength`;支线追问接入 `AbortSignal`;手写 4xx 也补 traceId。
- `server/__tests__/skill-generalChat.test.ts` — 覆盖 stub provider 也能输出自然闲聊文本。
- `server/__tests__/chat-route.test.ts` — 覆盖 traceId 透传与 agent run 诊断字段。
- `doc/knowledge/skills.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/architecture.md` — 同步更新 general-chat、traceId 和 agent_runs 诊断字段约定。
- `doc/prd-gap-audit.md` — 删除已收口的缺口条目，保留仍未实现的核心缺口。

## 手工测试

### 后端单测

命令:

```powershell
npm run test:server -- --runInBand server/__tests__/skill-generalChat.test.ts server/__tests__/chat-route.test.ts
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-generalChat.test.ts
Tests: 40 passed, 40 total
```

### 构建

命令:

```powershell
npm run build
```

观察输出:

```text
✓ built in 2.25s
(!) Some chunks are larger than 500 kB after minification.
```

### 格式检查

命令:

```powershell
git diff --check
```

观察输出:

```text
warning: in the working copy of 'server/__tests__/chat-route.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/__tests__/skill-generalChat.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/ai/providers/stub.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/createApp.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/middleware/auth.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/middleware/error.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/routes/chat.ts', LF will be replaced by CRLF the next time Git touches it
```

### 负样本

- `server/__tests__/skill-generalChat.test.ts` 覆盖了 provider.chat 抛错会显式返回 `GENERAL_CHAT_FAILED`。
- `server/__tests__/chat-route.test.ts` 覆盖了带 `X-Request-Id` 的请求，错误响应会携带 `traceId`。

### 总结

已跑过 3 / 3 步，全部通过。

## 遗留 TODO

- [后端] SSE 传输现代化与多副本恢复。
- [后端] 归档会话的模板化派生。
- [后端] 取消信号在所有长运行 skill/provider 路径上的进一步核对。
- [前端] Widget 样式目录是否拆分仍未定案。

## 下一阶段建议

1. **SSE 现代化**(PRD §2.8 / §3.4 / §5.1) — 优先把 `EventSource + ?token=` 与单进程内存回放升级掉。
2. **归档会话模板化派生**(PRD §3.1 / §5.2) — 为 archived 会话定义安全复用的正式入口。
3. **取消信号全链路传播**(PRD §3.5) — 继续核对所有长运行 skill 的 abort 传播是否一致。
4. **Widget 样式目录拆分**(工程收尾项) — 后续如果 widget 继续膨胀，可以再评估独立样式目录。

