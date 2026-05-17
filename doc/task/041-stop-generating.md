> 日期: 2026-05-18
> 序号: 041
> 任务: 停止生成与流式状态恢复

## 任务背景

PRD §3.5 / §4.8 要求用户可以停止 AI 生成,并在停止后保留已生成内容、恢复输入区,避免界面长期卡在“正在回复”。当前后端已有 `AbortController` 雏形,但没有可调用的停止端点和前端按钮。

## 执行摘要

- `server/routes/chat.ts` — 新增活跃 Skill 流注册表和 `POST /api/chat/streams/:streamId/abort`,停止当前用户的活跃流、触发 `AbortController`、补发 `done(reason=aborted)` 并写 `agent_runs.status='aborted'`。
- `shared/api.ts`、`src/api/chat.ts` — 新增 `ChatAbortStreamResp` 和 `chatApi.abortStream(streamId)`。
- `src/api/sse.ts` — 导出 `OpenStreamHandle`,供 store 主动关闭本地 EventSource。
- `src/stores/chat.ts` — 记录 `currentStreamId`,新增 `stopGenerating()`,停止成功后关闭 EventSource、清空流式态;若 assistant 仍为空则显示“已停止生成。”。
- `src/views/Chat/ChatInput.tsx` — 流式回复中把发送按钮切换为“停止”,点击后调用 `stopGenerating()`。
- `server/__tests__/chat-route.test.ts`、`src/__tests__/stores/chat.test.ts`、`src/__tests__/views/ChatInput.test.tsx` — 覆盖停止端点、agent_run 状态、store 清理和输入按钮切换。
- `doc/knowledge/api-contract.md`、`doc/knowledge/styling.md` — 同步记录停止生成 API 与 UI 行为。

## 手工测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests:       27 passed, 27 total
```

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/ChatInput.test.tsx
```

观察输出:

```text
Test Files  2 passed (2)
Tests       19 passed (19)
```

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       114 passed, 114 total
Test Files  10 passed (10)
Tests       83 passed (83)
```

命令:

```bash
npm run build
```

观察输出:

```text
vite v5.4.21 building for production...
✓ 80 modules transformed.
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.94s
```

命令:

```bash
git diff --check
```

观察输出:

```text
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 活跃 stream 调用 abort 后返回 `{ aborted: true }`,消息流事件中出现 `done(reason=aborted)`。
- 对应 `agent_runs` 写入 `status='aborted'` 和 `error_type='AbortError'`。
- 前端流式中按钮显示“停止”;点击后调用 `stopGenerating()`。
- store 停止成功后清空 `streamingMessageId/currentStreamId`,关闭 EventSource;空 assistant 显示“已停止生成。”。

覆盖的负向场景:

- 停止不存在或已结束的 stream 返回 `404 NOT_FOUND`,不会误改其他会话。
- `abortStream` 失败时 store 保留当前流式态并显示错误,避免前端假装已停止。

## 遗留 TODO

- [前端] 仍使用 EventSource + `?token=`;生产化前应迁移到 fetch + ReadableStream,进一步减少 URL token 暴露。
- [后端] 少数不消费 `AbortSignal` 的 provider/skill 可能要等下一次 yield 才彻底结束后台协程;本次已先让 UI 与 `agent_runs` 进入停止态。
- [构建] Vite 仍提示主 chunk 超过 500 kB,不影响本次功能,后续可按路由拆分。

## 下一阶段建议

1. **自适应难度调节**(PRD §2.6) — 基于连续场景表现和“太难/太简单”输入调整下一题或下一场景难度。
2. **辅助追问加入复盘**(PRD §3.2) — 用户显式确认后将支线解释摘要或错因标签写入结构化统计。
3. **移动端辅助追问抽屉完善**(PRD §4.1) — 对齐历史抽屉,补遮罩、Esc 关闭和输入焦点恢复。
4. **动态题量**(PRD §2.6) — 从每阶段固定 2 题扩展为按等级/表现生成 5-10 题。
