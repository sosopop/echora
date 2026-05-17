> 日期: 2026-05-17
> 序号: 018
> 任务: 接入练习中会话锁定

## 任务背景

根据 PRD §3.1 / §4.7,练习或批改进行中不应在历史消息里直接暴露用户旧答案、参考答案和批改详情。本次在 016 重练与 017 复盘回看基础上补齐 `lock_policy` 的真实行为与 `conversation-lock` 前端组件。

## 执行摘要

- `server/services/conversation.ts` — 新增 `lockPolicyForLearningState`,让 `createConversation` / `updateLearningState` 自动维护 `lock_policy`;归档会话同步进入 `archived + open`。
- `server/routes/chat.ts` — `GET /api/chat/conversations/:id/messages` 在 locked 状态下脱敏历史答题消息,把 `grading-result` 替换为 `conversation-lock`。
- `src/components/widgets/ConversationLock.tsx`、`src/components/widgets/WidgetRenderer.tsx`、`src/views/Chat/WidgetSlot.tsx`、`src/components/widgets/widgets.module.css` — 增加正式锁定提示组件,并保持 loading / 缺字段时不占位。
- `server/__tests__/chat-route.test.ts`、`server/__tests__/learning-services.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx` — 覆盖锁定态脱敏、解锁态恢复、state → lock_policy、前端组件渲染。
- `doc/knowledge/api-contract.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/styling.md`、`doc/knowledge/skills.md` — 同步记录会话锁定 API 行为、状态机规则和组件入口。

## 手工测试

### 定向后端单测

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/learning-services.test.ts
```

实测输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/learning-services.test.ts
Test Suites: 2 passed, 2 total
Tests: 25 passed, 25 total
```

覆盖的负样本:

```text
locked 历史隐藏用户答案与 grading-result 详情:
响应中不包含原始用户答案、参考表达 "Thank you."、批改解释。
```

### 定向前端组件单测

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

实测输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (23 tests)
Test Files 1 passed (1)
Tests 23 passed (23)
```

### 全量单元测试

命令:

```bash
npm run test:unit
```

实测输出:

```text
Test Suites: 14 passed, 14 total
Tests: 87 passed, 87 total
Test Files 9 passed (9)
Tests 58 passed (58)
```

说明:Vitest 仍会输出既有的 React Router future flag warning 与 profile 失败路径调试日志,不影响通过。

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

实测输出:

```text
[smoke:learn] PASSED 10 / 10
```

负样本:

```text
F grading 态调 scene-select → router state_not_allowed (502)
H /send 同时传 text + action → 400 VALIDATION_FAILED
```

### 构建

命令:

```bash
npm run build
```

实测输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 73 modules transformed.
✓ built in 1.61s
```

### diff 空白检查

命令:

```bash
git diff --check
```

实测输出:

```text
Exit code: 0
仅输出 Windows 工作区既有 LF → CRLF 提示,未发现 whitespace error。
```

### 总结

已跑过 6 / 6 步,全部通过;包含 2 个负向路径(locked 脱敏、非法状态/非法入参)。

## 遗留 TODO

- [后端] `grading` 作为显式短暂状态仍未完全接入提交答案的生命周期;当前锁定主要依赖 `practicing` 与 `lock_policy`。
- [后端] `archived` 只读后的“基于此场景重练 / 复制总结”尚未实现。
- [前端] 历史抽屉列表项尚未显示 locked/archived 小标识。
- [测试] 可在后续 smoke 中补一条真实 HTTP 历史消息 locked/unlocked 切换断言。

## 下一阶段建议

1. **辅助追问 explain**(PRD §2.2 / §2.7)— 将 `explain` 从文本 stub 改为读取最近题目、答案与批改结果,回答“为什么错/怎么改”,提升练习中纠错闭环。
2. **意图确认 intent-confirm**(PRD §2.3)— 真实 Provider 低置信度路由时展示自然选项,减少自由输入误路由到错误 Skill。
3. **归档与只读恢复**(PRD §3.1)— 实现 archived 会话只读、复制总结和基于旧场景重练,补齐会话生命周期。
4. **历史抽屉状态标识**(PRD §4.1 / §4.7)— 在会话列表显示 locked/archived 状态,让用户知道为什么旧答案暂时不可见。
