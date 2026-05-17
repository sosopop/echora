# 032 辅助追问接入真实 Provider

## 任务背景

030/031 已经完成辅助追问的支线数据、API 与右侧面板,但支线 assistant 回复仍是后端规则化安全提示。PRD §3.2 要求支线可以继承来源上下文连续追问,因此需要让支线回复接入真实 Provider `chat()`,同时保持主学习流隔离和锁定态防泄露。

## 执行摘要

- `POST /api/chat/branch-threads/:threadId/messages` 改为异步生成支线回复。
- Provider 支持 `chat()` 时,使用支线 system prompt + 来源上下文 + 用户追问调用真实 LLM,收集 `text-delta` 后写入支线 assistant message。
- Provider 不支持 `chat()` 或 stub provider 下,保留确定性安全提示 fallback。
- Provider chat 抛错时返回 `502 PROVIDER_ERROR`,不静默降级。
- 主线 locked(`practicing` / `grading`) 时,支线 prompt 不携带来源正文,避免通过支线绕过答案/参考表达锁定。
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
Tests:       24 passed, 24 total
Test Suites: 1 passed, 1 total

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       111 passed, 111 total
Test Files  9 passed (9)
Tests       69 passed (69)

> echora@0.1.0 build
✓ built in 2.52s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 解锁态支线回复使用 `provider.chat`,并把来源正文放入 prompt。
- locked 态支线回复仍可调用 provider,但 prompt 不包含来源正文。
- Provider 不实现有效文本时仍保留规则化安全提示。

覆盖的负向场景:

- `provider.chat` 抛错时返回 `502 PROVIDER_ERROR`,错误文案包含“辅助追问生成失败”。

## 遗留 TODO

- 支线当前是同步 HTTP 返回,尚未做 SSE 流式显示。
- 支线多轮上下文暂时只发送当前追问和来源上下文,未把该支线历史消息完整传给 Provider。
- “加入复盘”仍未写入统计。

## 下一阶段建议

继续补齐支线多轮上下文:发送支线消息时把该 `branchThreadId` 下的历史 user/assistant 消息一起传给 Provider,让追问链可以承接前一轮解释。
