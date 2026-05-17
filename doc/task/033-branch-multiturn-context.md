# 033 辅助追问多轮上下文

## 任务背景

032 已把辅助追问支线接入真实 Provider,但每次只传来源上下文与当前追问,无法承接用户在同一支线里的前一轮解释。PRD §3.2 要求辅助追问可形成解释链,因此需要把同一 `branchThreadId` 下的历史支线消息一起传给 Provider。

## 执行摘要

- `POST /api/chat/branch-threads/:threadId/messages` 在生成回复前读取当前支线最近 20 条历史消息。
- `buildBranchAssistantText` 将来源上下文作为第一条 user message,随后追加历史 user/assistant 消息,最后追加当前追问。
- 保留 locked 态防泄露:来源正文仍隐藏,但支线自身历史会作为支线对话上下文传入。
- 更新 `doc/knowledge/api-contract.md` 与 `doc/knowledge/skills.md`。

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
Tests:       25 passed, 25 total
Test Suites: 1 passed, 1 total

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       112 passed, 112 total
Test Files  9 passed (9)
Tests       69 passed (69)

> echora@0.1.0 build
✓ built in 2.43s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 同一支线已有一轮 user/assistant 历史时,Provider 收到的 messages 依次包含来源上下文、上一问、上一答、当前追问。
- 既有 provider 成功、locked 防泄露、fallback 支线回复用例继续通过。

覆盖的负向场景:

- `provider.chat` 抛错仍返回 `502 PROVIDER_ERROR`,没有因为多轮上下文改动而静默降级。

## 遗留 TODO

- 支线历史条数当前固定为 20,尚未做 token 预算裁剪。
- 支线消息仍是同步 HTTP 返回,未做 SSE 流式体验。
- “加入复盘”仍未实现。

## 下一阶段建议

实现“加入复盘”:用户确认后把支线解释摘要或错因标签写入结构化统计,并通过 `included_in_stats=true` 与普通支线聊天区分。
