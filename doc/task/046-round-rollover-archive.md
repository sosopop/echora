> 日期: 2026-05-18
> 序号: 046
> 任务: 复盘后自动归档并开启下一轮会话

## 任务背景

PRD §3.1 要求系统根据学习状态管理会话生命周期,一轮练习结束后可自动归档并新建会话。此前 `archived` 只读和历史脱敏已经存在,但用户在完成复盘后点击继续/换场景仍会把新一轮场景追加到旧会话里,历史列表无法自然分隔“一轮学习”。

## 执行摘要

- `server/routes/chat.ts` — 在 `awaiting_next` / `reviewing` 的 active 会话中收到 `request-new-scenes` 时,先 `archiveConversation` 归档旧会话,再创建新的 `scene_selecting` 会话承接本次请求;`review` 与 `retry` 不触发归档。
- `shared/api.ts` — `ChatSendResp` 增加可选 `archivedConversationId`,让前端知道本次请求发生了会话 rollover。
- `src/stores/chat.ts` — 当 `/api/chat/send` 返回的新 `conversationId` 不同于当前会话时,切换当前消息列表,清空上一轮 active widgets/支线面板状态,并刷新历史会话列表。
- `server/__tests__/chat-route.test.ts` — 覆盖 `awaiting_next` 继续下一轮与 `reviewing` 换场景都会归档旧会话、新建下一轮,同时保留 archived 只读负样本。
- `src/__tests__/stores/chat.test.ts` — 覆盖前端收到新会话响应时清空旧消息/旧 widget/支线状态并展示新一轮流式消息。
- `doc/knowledge/api-contract.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/skills.md`、`doc/knowledge/styling.md` — 同步 rollover API、状态机和前端展示行为。

## 手工测试

### 后端与前端聚焦测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/learning-services.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/learning-services.test.ts
Test Suites: 2 passed, 2 total
Tests:       49 passed, 49 total
```

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/HistoryPanel.test.tsx
```

观察输出:

```text
Test Files  2 passed (2)
Tests       15 passed (15)
```

### 构建

命令:

```bash
npm run build
```

观察输出:

```text
✓ built in 2.02s
(!) Some chunks are larger than 500 kB after minification.
```

### 全量验证

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       129 passed, 129 total
Test Files  11 passed (11)
Tests       87 passed (87)
```

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
git diff --check
```

观察输出:

```text
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- `awaiting_next` 下输入 `START` 会归档旧会话,创建新的 `scene_selecting` 会话并执行场景选择。
- `reviewing` 下输入 `换场景` 会归档当前复盘会话,新一轮消息写入新会话。
- 前端收到新 `conversationId` 后当前消息列表只保留新一轮用户消息和 assistant 流式消息。

覆盖的负向场景:

- 已归档会话继续练习仍返回 `400 VALIDATION_FAILED`,且不创建新消息。
- `reviewing` 下输入 `重练` 仍走 `retry`,不会触发归档。

## 遗留 TODO

- [前端] 当前 rollover 后以历史列表刷新体现旧会话已归档,尚未在聊天区显示“上一轮已归档”的独立提示条。
- [测试] learning smoke 仍只覆盖手工归档只读负样本,尚未把完成复盘后自动 rollover 纳入跨层脚本。
- [产品] archived 会话“作为新学习流上下文引用”的复制/派生能力仍未定义。

## 下一阶段建议

1. **SSE 恢复体验验收**(PRD §2.8 / §3.4 / §5.1)— 会话生命周期已经更完整,下一步可补断线重连与历史快照恢复的跨层验证,保证长流式任务中消息和 widget 不丢。
2. **移动端辅助追问抽屉完善**(PRD §3.2 / §4.1 / §4.9)— 主学习闭环已进入可用状态,可继续补移动端支线遮罩、关闭和焦点恢复。
3. **支线解释摘要入复盘**(PRD §3.2)— “加入复盘”目前写标签和掌握度,可继续保存用户确认的解释摘要,提升复盘报告可解释性。
4. **账号保存进度提示真实化**(PRD §4.7)— `account-gate` 已有组件,可把保存进度/登录提示与会话归档状态联动,让用户理解历史与进度已经被保留。
