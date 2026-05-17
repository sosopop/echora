# 030 辅助追问支线后端闭环

## 任务背景

PRD §3.2 要求用户可以对任意消息、题目、批改结果或 Widget 打开辅助追问支线,并且支线不能改变主学习流、不能泄露未提交题目的标准答案、默认不计入学习统计。已有 schema 中 `branch_threads` 与 `messages.branch_thread_id` 已存在,但缺少服务层、API 与主线消息隔离。

## 执行摘要

- 新增 `server/services/branchThread.ts`,封装 `branch_threads` 的创建、查询与列表。
- 扩展 `server/services/message.ts`,支持 `AppendMessageInput.branchThreadId`,新增 `getMessage` 与 `getBranchMessages`,并让 `getMessages` 默认只返回主线消息。
- 新增辅助追问 API:
  - `GET /api/chat/conversations/:id/branch-threads`
  - `POST /api/chat/conversations/:id/branch-threads`
  - `GET /api/chat/branch-threads/:threadId/messages`
  - `POST /api/chat/branch-threads/:threadId/messages`
- 更新 `shared/api.ts` 与 `src/api/chat.ts`,补齐 `BranchThreadDTO`、创建请求、支线消息发送响应和前端 API client。
- 支线发送同步写入 user/assistant 两条支线消息,不创建 `agent_runs`,不发 SSE,不改变 `learning_state` / `active_skill` / `input_mode`。
- locked 会话下支线回复不复述来源消息正文,避免绕过主线历史答案脱敏。
- 更新 `doc/knowledge/api-contract.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/skills.md`。

## 手工测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts --runInBand
npm run test:unit
npm run build
git diff --check
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests:       21 passed, 21 total
Test Suites: 1 passed, 1 total

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       108 passed, 108 total
Test Files  9 passed (9)
Tests       67 passed (67)

> echora@0.1.0 build
✓ built in 2.27s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 创建辅助追问支线后,`branch_threads.source_ref` 可回读。
- 支线发送后,user/assistant 消息都带 `branchThreadId`,主线 `getMessages` 不包含支线消息。
- 支线发送后主会话仍保持 `practicing`,未改变主学习态。
- 支线列表与支线消息详情只返回当前支线数据。

覆盖的负向场景:

- 使用其他会话的 `sourceMessageId` 创建支线时返回 404,错误文案包含“来源消息”。

## 遗留 TODO

- 前端右侧辅助追问面板尚未接入;当前只完成后端 API 与前端 client。
- 支线 assistant 回复当前为确定性安全提示,尚未接入真实 Provider 的连续追问生成。
- “加入复盘”确认动作尚未实现,普通支线消息仍不写学习统计。

## 下一阶段建议

优先实现右侧辅助追问面板:从主消息打开支线、展示支线历史、发送连续追问,并在桌面端放入 PRD 规划的右侧栏,移动端后续再收进抽屉。
