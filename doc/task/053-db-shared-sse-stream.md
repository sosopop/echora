> 日期: 2026-05-18
> 序号: 053
> 任务: DB 共享 SSE 事件源收口

## 任务背景

根据 `doc/prd-gap-audit.md` 剩余缺口,本次收口 PRD §2.8 / §3.4 / §5.1 的 SSE 多副本恢复能力。产品决策采用 SQLite/DB 共享层路线,保留 `streamBus` 作为本进程低延迟快路径。

## 执行摘要

- `server/services/streamEventSource.ts` — 新增 streamId 解析、stream 所有权校验、按 streamId + seq 从 `messages.stream_events` 回放持久化事件的服务层。
- `server/routes/chat.ts` — SSE 打开前校验 `stream-<assistantMessageId>-...` 格式和当前用户所有权;DB 持久化事件成为跨实例权威事件源,`streamBus` 继续作为本进程即时广播。
- `server/__tests__/chat-route.test.ts` — 补充非法 streamId、跨用户 stream 拒绝、同一消息多 streamId 不串流的覆盖。
- `doc/knowledge/architecture.md` / `doc/knowledge/api-contract.md` — 更新 SSE 多副本恢复的正式架构口径。
- `doc/prd-gap-audit.md` — 将 SSE 传输现代化与多副本恢复从剩余缺口移动到已关闭缺口。

## 手工测试

### 后端 SSE 单元/集成

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts -t "SSE|stream" --runInBand
```

实测输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests: 34 skipped, 8 passed, 42 total
```

结论:覆盖持久化事件回放、DB 轮询补回、非法 streamId 负样本、跨用户 stream 负样本、abort stream 等 SSE 相关路径,全部通过。

### 后端 chat 路由完整回归

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts --runInBand
```

实测输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests: 42 passed, 42 total
```

结论:chat 路由现有锁定、支线、归档派生、SSE、状态路由等覆盖全部通过。

### Diff 空白检查

命令:

```bash
git diff --check
```

实测输出:

```text
warning: in the working copy of 'doc/knowledge/api-contract.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'doc/knowledge/architecture.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'doc/prd-gap-audit.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/__tests__/chat-route.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/routes/chat.ts', LF will be replaced by CRLF the next time Git touches it
```

结论:无 trailing whitespace 或 patch 格式错误;仅 Git 行尾提示。

### 负样本

- 非法 `streamId=stream-query-token` 返回 `400 VALIDATION_FAILED`。
- 当前用户读取其他用户 assistant message 对应 stream 返回 `404 STREAM_NOT_FOUND`。

### 总结

已跑过 3 / 3 步,全部通过。负样本已包含在 SSE 测试集中。

## 遗留 TODO

- [前端] Widget 样式目录拆分仍是 `doc/prd-gap-audit.md` 中唯一剩余工程收尾项。
- [后端] 若未来高并发多副本部署超过 SQLite JSON array 承载边界,可评估 Redis Streams 或独立 append-only stream 表;V1 暂不引入。

## 下一阶段建议

1. **Widget 样式目录拆分**(PRD §4.1 / §4.2)— 将 widget 全局壳样式从 `components.css` 拆到 `src/styles/widgets/`,降低后续 widget 扩展时的样式耦合。
2. **完整门禁回归**(PRD §5.1 / §5.2)— 在所有缺口关闭后跑 `npm run test:unit`、学习 smoke、build 与 diff check,确认主线与负样本没有回退。
3. **缺口清单归零**(PRD §5.1)— Widget 样式收尾后更新 `doc/prd-gap-audit.md`,明确 PRD V1 已无剩余缺口。
