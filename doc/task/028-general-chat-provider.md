> 日期: 2026-05-17
> 序号: 028
> 任务: general-chat 接入真实 Provider

## 任务背景

PRD §2.2 / §2.3 将 `general-chat` 定义为 8 个 Skill 之一,用于非锁定态低风险兜底聊天。此前 `general-chat` 只能输出规则化提示,本次接入 Provider `chat()` 的真实流式回复路径,同时保留 stub fallback 和低置信度确认。

## 执行摘要

- `server/skills/generalChat.ts` — 当 `ctx.params.userText` 存在且 Provider 支持 `chat()` 时,调用真实 LLM 流式输出;Provider 不支持 `chat()` 时保留规则化引导;Provider 抛错时显式返回 `GENERAL_CHAT_FAILED`。
- `server/routes/chat.ts` — 高置信度路由到 `general-chat` 时,把用户原文写入 `decision.params.userText`;低置信度 `intent-confirm` 路径保持不变。
- `server/__tests__/skill-generalChat.test.ts` — 覆盖默认 fallback、真实流式文本、Provider 错误和 `intent-confirm` widget。
- `server/__tests__/chat-route.test.ts` — 覆盖非锁定态 `general-chat` 决策会携带用户原文。
- `doc/knowledge/skills.md`、`doc/knowledge/api-contract.md` — 同步 `general-chat` 真实化、错误显式暴露和测试入口。

## 手工测试

### 后端单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-generalChat.test.ts server/__tests__/chat-route.test.ts
```

输出:

```text
PASS server/__tests__/skill-generalChat.test.ts
PASS server/__tests__/chat-route.test.ts
Test Suites: 2 passed, 2 total
Tests: 22 passed, 22 total
```

负样本:`provider.chat 抛错时显式返回 GENERAL_CHAT_FAILED` 覆盖 Provider 失败路径,确认不会静默退回规则化文本。

### 全量单元

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 105 passed, 105 total
Test Files 9 passed (9)
Tests 67 passed (67)
```

### 构建

命令:

```bash
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ built in 2.37s
```

### Diff 空白检查

命令:

```bash
git diff --check
```

输出:

```text
warning: in the working copy of '...', LF will be replaced by CRLF the next time Git touches it
```

结论:仅有 Windows 行尾提示,无 whitespace error。已跑过 4 / 4 步,全部通过。

## 遗留 TODO

- [后端] `general-chat` 尚未带入会话摘要或学习记忆,只传当前用户原文。
- [安全] 当前系统 prompt 是低风险约束,未来可加入更细的内容安全策略和可执行动作边界提示。
- [测试] 真实 OpenAI / Anthropic smoke 仍通过既有 provider 测试覆盖,未新增外部 API smoke。

## 下一阶段建议

1. **辅助追问右侧支线**(PRD §3.2)— `explain` 已能回答追问,下一步应接入 `branch_threads` 与右侧支线面板。
2. **动态题量与难度**(PRD §2.6)— 当前每阶段固定 2 题,还未按 Profile/表现动态调整到 5-10 题与难度升降。
3. **归档引用为新会话**(PRD §3.1 / §3.5)— archived 已只读,但还不能作为模板新开练习流。
4. **复盘非分数化**(PRD §2.2 / §4.7)— 批改卡已三档化,复盘仍展示平均分,可统一为三档分布和达标趋势。
