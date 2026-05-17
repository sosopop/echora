> 日期: 2026-05-17
> 序号: 025
> 任务: 归档会话只读保护

## 任务背景

PRD §3.1 / §3.5 / §5.2 要求 `archived` 会话不可继续答题,只能复盘或作为后续引用。此前数据库和类型已有归档状态,但 `/api/chat/send` 入口没有显式拦截归档会话继续练习。

## 执行摘要

- `server/routes/chat.ts` — 在解析会话后增加 archived guard:`status='archived'` 或 `learningState='archived'` 时,仅允许复盘类文本进入 `review`;其他文本或 action 直接 `400 VALIDATION_FAILED`,且不创建消息、agent run 或 SSE stream。
- `server/__tests__/chat-route.test.ts` — 覆盖 archived 会话继续练习被拒且不落消息,以及 archived 会话中"复盘"仍确定性路由到 `review`。
- `server/__tests__/learning-services.test.ts` — 覆盖 `archiveConversation` 会写入 `status=archived`、`learningState=archived`、`lockPolicy=open` 和 `archivedAt`。
- `tests/smoke/run-smoke-learning.ts` — 新增场景 M,验证 archived 会话继续练习返回 400 且消息数不变。
- `doc/knowledge/api-contract.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/skills.md` — 同步 archived 只读行为、测试入口与 smoke 场景数量。

## 手工测试

### 后端路由与服务

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/learning-services.test.ts
```

输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/learning-services.test.ts
Test Suites: 2 passed, 2 total
Tests: 30 passed, 30 total
```

负样本:新增 `archived 会话只允许复盘,继续练习被拒且不创建消息` 断言 `400 VALIDATION_FAILED`,错误消息包含"已归档",并确认 `messages` 数量未变化。

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] === 13 scenarios ===
[smoke:learn] ✓ M archived 会话继续练习 → 400 且不创建消息 (86ms)
[smoke:learn] PASSED 13 / 13
```

### 全量单元

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 102 passed, 102 total
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
✓ built in 2.33s
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

结论:仅有 Windows 行尾提示,无 whitespace error。已跑过 5 / 5 步,全部通过。

## 遗留 TODO

- [后端] archived 会话目前只能复盘;PRD 中"作为新学习流上下文引用"和"复制为新会话模板"尚未实现。
- [前端] 历史列表尚未突出 archived 状态,用户只能从顶部状态或只读拒绝提示感知归档。
- [产品] 尚未定义练习完成后何时自动归档旧会话、何时保留为可继续的 `awaiting_next/reviewing`。

## 下一阶段建议

1. **辅助追问右侧支线**(PRD §3.2)— schema 已有 `branch_threads`,explain 已能生成来源提示,下一步可把追问放入右侧支线而不是主消息流。
2. **归档引用为新会话**(PRD §3.1 / §3.5)— 在 archived 只读基础上,实现"基于旧场景新开练习"或"引用旧复盘"。
3. **自由聊天真实化**(PRD §2.2 / §2.3)— 非锁定态 `general-chat` 仍是规则文本,可接真实 Provider 并保留低置信度确认。
4. **复盘非分数化**(PRD §2.2 / §4.7)— 批改卡已三档化,复盘仍展示平均分;可改为三档分布、薄弱点趋势和达标情况。
