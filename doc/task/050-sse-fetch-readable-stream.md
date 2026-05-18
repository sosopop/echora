> 日期: 2026-05-18
> 序号: 050
> 任务: SSE fetch 流与 Last-Event-ID 续传

## 任务背景

`doc/prd-gap-audit.md` 仍记录 SSE 传输停留在 `EventSource + ?token=` 与单进程内存回放。PRD §2.8 / §3.4 / §5.1 要求流式事件可续传恢复,且已确认消息不能丢失,本次优先把认证、续传和多副本兜底补到可运行状态。

## 执行摘要

- `src/api/sse.ts` — 从浏览器 `EventSource` 改为 `fetch + ReadableStream`,SSE token 走 `Authorization` header;重连时发送标准 `Last-Event-ID`。
- `server/routes/chat.ts` — `/api/chat/stream` 支持 `Last-Event-ID`,保留 `lastSeq` 兼容;在内存 `streamBus` 之外增加 `messages.stream_events` 轮询补回,覆盖内存丢失或多副本错连场景。
- `server/middleware/auth.ts` — 移除 `?token=` 查询参数认证兜底,避免访问令牌进入 URL。
- `server/__tests__/chat-route.test.ts` — 覆盖 `Last-Event-ID` 持久化回放、DB 轮询补回、query token 被拒绝。
- `src/api/sse.test.ts` — 新增前端流封装单测,验证 Authorization header、URL 不含 token、重连携带 `Last-Event-ID`。
- `tests/smoke/run-smoke.ts`、`tests/smoke/run-smoke-onboarding.ts`、`tests/smoke/run-smoke-learning.ts` — smoke 脚本改用 Authorization header 与 `Last-Event-ID`。
- `doc/knowledge/api-contract.md`、`doc/knowledge/architecture.md`、`doc/prd-gap-audit.md` — 同步 SSE 协议事实和剩余缺口。

## 手工测试

### 后端单测

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts -t "SSE" --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests: 3 passed, 36 skipped, 39 total
```

### 前端单测

命令:

```powershell
npx vitest run src/api/sse.test.ts
```

观察输出:

```text
✓ src/api/sse.test.ts (2 tests)
```

### 通用 smoke

命令:

```powershell
npm run test:smoke
```

观察输出:

```text
[smoke] PASSED 6/6
```

### Onboarding smoke

命令:

```powershell
npm run test:smoke:onboarding
```

观察输出:

```text
[smoke:onb] PASSED 11 / 11
```

### 学习闭环 smoke

命令:

```powershell
npm run test:smoke:learning
```

观察输出:

```text
[smoke:learn] PASSED 13 / 13
```

### 构建

命令:

```powershell
npm run build
```

观察输出:

```text
✓ built in 2.08s
(!) Some chunks are larger than 500 kB after minification.
```

### 空白/格式检查

命令:

```powershell
git diff --check
```

观察输出:

```text
warning: in the working copy of '...', LF will be replaced by CRLF the next time Git touches it
```

结论:未发现空白错误,仅 Windows CRLF 提示。

### 负样本

- 后端单测 `SSE 不再接受 query token 认证` 覆盖旧式 `?token=` 请求返回 `401 UNAUTHORIZED`。
- 后端单测 `SSE 会轮询数据库补回不经 streamBus 发布的新事件` 覆盖只落 DB、不发布进程内总线时仍能恢复终止事件。

### 总结

已跑过 6 / 6 组验证,全部通过;构建仅保留 Vite chunk size 警告。

## 遗留 TODO

- [后端] 当前多副本恢复通过 DB 轮询兜底,尚未引入 Redis Streams 或等价共享流后端。
- [性能] 300ms 轮询只在打开的 SSE 连接期间生效,后续若并发连接升高,需要评估数据库压力和指数退避策略。
- [测试] 尚未做真实多进程/多副本部署级别 E2E,当前覆盖的是“内存总线缺失但 DB 可见”的等价单测路径。

## 下一阶段建议

1. **取消信号全链路传播**(PRD §3.5) — 继续核对所有长运行 skill/provider 调用,减少用户点击停止后仍在后台消耗 token 的情况。
2. **归档派生上下文增强**(PRD §3.1 / §5.2) — 在“基于此再练”的新会话首屏展示旧复盘摘要和薄弱点,让用户知道继承了什么。
3. **共享流后端评估**(PRD §2.8 / §3.4 / §5.1) — 若要进入多副本生产部署,把 `streamBus` 抽象到 Redis Streams 或等价实现。
4. **Widget 样式目录拆分**(工程收尾项) — 若后续继续扩展 widget,再拆 `src/styles/widgets/` 降低样式文件耦合。
