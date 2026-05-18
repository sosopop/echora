> 日期: 2026-05-18
> 序号: 047
> 任务: SSE 断线恢复与历史快照兜底

## 任务背景

PRD §2.8 / §3.4 / §5.1 要求 SSE 断线后先按最后收到的 seq 续传,若 replay buffer 过期或丢失,前端要回退到消息历史与 widget snapshot 恢复界面,而不是停留在空白流式占位。此前系统只有内存 ring buffer 回放,断线后最终失败会把 assistant 泡泡变成错误文本,还缺少持久化事件回放和历史快照兜底。

## 执行摘要

- `server/routes/chat.ts` — `/api/chat/stream` 先从内存 ring buffer replay,再按 `stream-<assistantMessageId>-...` 解析 assistant 消息 id,回放 `messages.stream_events` 中已持久化事件;若事件里已包含 `done/error`,直接结束 SSE。
- `server/services/message.ts` — 新增 `getMessageStreamEvents()` 读取单条消息的持久化流事件,供 SSE 回放兜底使用。
- `src/api/sse.ts` — 将 skill `error` 和传输层失败分流,为 `onError` 增加 `{ kind: 'skill' | 'transport' }` 标记。
- `src/stores/chat.ts` — skill `error` 继续写回当前 assistant 消息;传输层最终失败时拉取 `chatApi.getMessages()` 恢复历史快照,并合并已显示的正文/widget,避免界面空白。
- `src/__tests__/stores/chat.test.ts` — 覆盖 skill error 仍写入 assistant 消息、SSE 传输失败后从历史快照恢复正文与 widget。
- `server/__tests__/chat-route.test.ts` — 覆盖持久化 `stream_events` 的 SSE 回放。
- `tests/smoke/run-smoke-onboarding.ts` — 新增缓存清空后从历史快照恢复的 smoke 场景。
- `doc/knowledge/api-contract.md`、`doc/knowledge/architecture.md`、`doc/knowledge/styling.md` — 同步 SSE 持久化回放、恢复分流和展示约定。

## 手工测试

### 后端 / 前端聚焦测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/skill-grade.test.ts server/__tests__/skill-practice.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-grade.test.ts
PASS server/__tests__/skill-practice.test.ts
Tests: 64 passed, 64 total
```

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/components/widgets/widgets.test.tsx
```

观察输出:

```text
✓ src/__tests__/stores/chat.test.ts (12 tests)
✓ src/__tests__/components/widgets/widgets.test.tsx (35 tests)
```

### 烟雾 / 构建

命令:

```bash
npm run test:smoke:learning
```

观察输出:

```text
[smoke:learn] PASSED 13 / 13
```

命令:

```bash
npm run build
```

观察输出:

```text
✓ built in 2.54s
(!) Some chunks are larger than 500 kB after minification.
```

命令:

```bash
git diff --check
```

观察输出:

```text
warning: in the working copy of 'server/__tests__/chat-route.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/routes/chat.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/services/message.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/__tests__/stores/chat.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/api/sse.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/stores/chat.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'tests/smoke/run-smoke-onboarding.ts', LF will be replaced by CRLF the next time Git touches it
```

### 负样本

- `server/__tests__/chat-route.test.ts` 覆盖了 `lastSeq=1` 时回放时不重复发送 seq=1 的事件。
- `src/__tests__/stores/chat.test.ts` 覆盖了 skill `error` 仍写入 assistant 消息,不会被当成 transport 恢复。
- `tests/smoke/run-smoke-onboarding.ts` 覆盖了 ring buffer 被 `clear()` 后仍可从历史快照恢复。

### 总结

已跑过 5 / 5 步,全部通过。

## 遗留 TODO

- [后端] `streamId` 目前通过正则解析 assistantMessageId,后续可考虑显式把 messageId 放入 SSE 元数据或路由查表,降低格式耦合。
- [前端] 恢复时仍依赖 `GET /messages` 的历史快照,若未来要做到更细的流中断点恢复,可进一步补 `lastSeq` 与本地 buffer 的合并策略。
- [测试] 目前 smoke 仅验证历史快照能恢复正文和基础 widget,未专门断言锁定态脱敏恢复后的视觉细节。

## 下一阶段建议

1. **SSE 标准化恢复链路**(PRD §2.8 / §3.4)— 现在已能从内存缓存和历史快照恢复,下一步可把 `Last-Event-ID` / 路由查表做得更稳,减少对 `streamId` 字符串格式的依赖。
2. **恢复状态提示文案**(PRD §4.7)— 当前恢复是静默完成,可再补一条轻提示,让用户知道刚才是断线重连而不是内容重发。
3. **消息快照增量合并**(PRD §2.7 / §3.4)— 现阶段恢复以整轮消息列表为主,后续可做更细粒度的局部增量合并,减少长会话重拉成本。
4. **断线恢复专项验收**(PRD §5.1)— 继续增加跨层 smoke,覆盖流中途断开、历史回放、widget 恢复和锁定态脱敏的完整闭环。
