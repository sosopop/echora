> 日期: 2026-05-17
> 序号: 019
> 任务: 真实 explain 追问与来源提示

## 任务背景

根据 PRD §2.2 / §3.2,用户需要在不打断主学习流的前提下追问题目或批改结果。本次先实现最小闭环:把 `explain` 从固定 stub 改为读取最近题目/批改记录,并用正式 `follow-up-source` widget 标明解释来源。

## 执行摘要

- `server/skills/explain.ts` — 真实读取最近 `exercise_attempts` 与 `grading_results`;未批改题只给提示不泄露标准答案,已批改题基于用户答案、参考表达、解析和错误标签解释。
- `server/routes/chat.ts` — 新增解释类文本确定性路由,在自由文本答案兜底前识别 `为什么 / 解释 / 怎么改 / why / explain` 等追问,避免被误提交为答案。
- `src/components/widgets/FollowUpSource.tsx`、`src/components/widgets/WidgetRenderer.tsx`、`src/views/Chat/WidgetSlot.tsx`、`src/components/widgets/widgets.module.css` — 正式渲染 `follow-up-source`,并保持 loading/缺字段不占位。
- `server/__tests__/skill-explain.test.ts`、`server/__tests__/chat-route.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx` — 覆盖已批改解释、未批改不泄露答案、无上下文提示、路由不误提交、前端组件渲染。
- `tests/smoke/run-smoke-learning.ts` — 新增 K 场景:答错后发送“为什么错”,断言路由到 `explain`,返回 `follow-up-source` 且解释包含最近批改标签。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/styling.md` — 同步 explain 行为、API 路由和组件入口。

## 手工测试

### 后端 explain 与路由单测

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-explain.test.ts server/__tests__/chat-route.test.ts
```

实测输出:

```text
PASS server/__tests__/skill-explain.test.ts
PASS server/__tests__/chat-route.test.ts
Test Suites: 2 passed, 2 total
Tests: 16 passed, 16 total
```

负样本:

```text
未提交/未批改题只给提示,不泄露标准答案:
文本包含“不直接给标准答案”和题型提示,不包含参考答案。
```

### 前端 widget 单测

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

实测输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (26 tests)
Test Files 1 passed (1)
Tests 26 passed (26)
```

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

实测输出:

```text
[smoke:learn] === 11 scenarios ===
[smoke:learn] ✓ K explain 追问最近批改 → follow-up-source + 错因解释
[smoke:learn] PASSED 11 / 11
```

负样本:

```text
H /send 同时传 text + action → 400 VALIDATION_FAILED
K 中“为什么错”不会走 submit-answer,而是 decision.skillName=explain。
```

### 全量单元测试

命令:

```bash
npm run test:unit
```

实测输出:

```text
Test Suites: 15 passed, 15 total
Tests: 91 passed, 91 total
Test Files 9 passed (9)
Tests 61 passed (61)
```

说明:Vitest 仍会输出既有 React Router future flag warning 与 profile 失败路径调试日志,不影响通过。

### 构建

命令:

```bash
npm run build
```

实测输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 74 modules transformed.
✓ built in 1.65s
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

已跑过 6 / 6 步,全部通过;包含 2 个负向路径(未批改不泄露答案、非法 text+action / explain 不误提交)。

## 遗留 TODO

- [前端] 完整右侧辅助追问面板和 branch 输入区尚未实现;当前 explain 仍显示在主消息流。
- [后端] `branch_threads` 创建、支线消息归属、解释链连续追问尚未接入。
- [后端] “加入复盘”确认写入结构化错因记录尚未实现。
- [产品] explain 当前为规则化解释,未调用真实 LLM 做更开放的语法/词汇追问。

## 下一阶段建议

1. **辅助追问右侧支线**(PRD §3.2)— 基于 `branch_threads` 和 `messages.branch_thread_id` 实现右侧支线面板,让 explain 不打断主学习流。
2. **intent-confirm 低置信度确认**(PRD §2.3)— 接入 `intent-confirm` widget,真实 Provider 低置信度时给 2-3 个自然选项而非直接执行。
3. **归档与只读恢复**(PRD §3.1 / §3.5)— 实现 archived 会话只读、继续答题拒绝和基于旧场景重练。
4. **单题降难替换**(PRD §2.6)— 第 2 次失败后自动生成同知识点降难替换题,减少用户卡题。
