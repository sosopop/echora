# 031 辅助追问右侧面板

## 任务背景

030 已完成辅助追问后端 API 与消息隔离,但用户还无法在聊天界面直接打开和使用支线。PRD §3.2 与设计原型 `doc/design/pages/chat-with-branch.html` 要求桌面端有右侧辅助追问区,用户可从主线消息打开支线并连续追问,且主学习流不被打断。

## 执行摘要

- 扩展 `useChatStore`,新增 `branchThreads/currentBranchThreadId/branchSourceMessageId/branchMessages/isBranchOpen/isBranchLoading/branchError` 以及 `openBranchForMessage/closeBranch/sendBranchMessage`。
- 新增 `src/views/Chat/BranchPanel.tsx`,展示来源消息、支线消息、发送框、loading 与错误状态。
- `MessageBubble` 增加非流式消息的“追问”入口,`MessageList` 点击后调用 `openBranchForMessage(messageId)`。
- `Chat` 主布局增加 `workspace` 与 `shellWithBranch`,宽屏下主区 + 360px 右侧支线并列,窄屏下支线 fixed 覆盖并隐藏主输入栏。
- 更新 `src/api/chat.ts` 使用 030 新增的支线 API。
- 更新 `doc/knowledge/styling.md` 记录右侧支线布局、入口和测试入口。

## 手工测试

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/MessageList.test.tsx src/__tests__/views/ChatInput.test.tsx
npm run test:unit
npm run test:smoke:learning
npm run build
git diff --check
```

观察输出:

```text
Test Files  3 passed (3)
Tests       17 passed (17)

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       108 passed, 108 total
Test Files  9 passed (9)
Tests       69 passed (69)

> echora@0.1.0 test:smoke:learning
[smoke:learn] PASSED 13 / 13

> echora@0.1.0 build
✓ built in 2.74s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 打开辅助追问时会查询/创建支线,加载该支线消息,并记录当前来源消息。
- 发送支线追问后,支线 user/assistant 消息追加到 `branchMessages`,主线 `messages` 不变化。
- 点击主线消息里的“追问”按钮会用该消息 id 打开支线。

覆盖的负向场景:

- 流式中的 assistant 消息不显示“追问”按钮,避免对尚未完成的回复开支线。

## 遗留 TODO

- 支线回复仍使用 030 的后端确定性安全提示,尚未接入真实 Provider 连续追问。
- “加入复盘 / 复制解释”等设计原型按钮暂未实现。
- 移动端支线当前为覆盖面板,还未做历史抽屉/支线抽屉的完整手势交互。

## 下一阶段建议

继续推进辅助追问真实化:把支线 assistant 回复接入真实 Provider `chat()`,带上来源上下文与安全约束,并补充不泄露未提交题答案的自动化测试。
