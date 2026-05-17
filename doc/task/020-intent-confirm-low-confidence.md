> 日期: 2026-05-17
> 序号: 020
> 任务: 低置信度 intent-confirm 确认卡

## 任务背景

根据 PRD §2.3,自由文本低置信度时应展示自然确认选项,而不是直接执行可能错误的 Skill 或降级到闲聊。本次实现非锁定学习态的 `intent-confirm` 最小闭环,并补上练习/批改中禁止降级到 `general-chat` 的服务端防线。

## 执行摘要

- `server/routes/chat.ts` — AI Router 返回 `confidence < 0.5` 且当前状态为 `scene_selecting/awaiting_next/reviewing` 时,改写为 `general-chat + params.intentConfirm`;`practicing/grading` 中 Router 试图降级 `general-chat` 时返回 `400 VALIDATION_FAILED`。
- `server/skills/generalChat.ts` — 保留默认文本兜底,新增 `intentConfirm` 参数分支,输出 `intent-confirm` widget。
- `src/components/widgets/IntentConfirm.tsx`、`src/components/widgets/WidgetRenderer.tsx`、`src/views/Chat/WidgetSlot.tsx`、`src/components/widgets/widgets.module.css` — 正式渲染低置信确认卡,按钮复用既有 `sendAction` / `sendMessage`。
- `server/__tests__/skill-generalChat.test.ts`、`server/__tests__/chat-route.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx` — 覆盖低置信改写、锁定态拒绝降级、确认卡渲染和点击动作。
- `tests/smoke/run-smoke-learning.ts` — 新增 L 场景:低置信路由返回 `intent-confirm`。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/styling.md` — 同步低置信协议和前端组件约定。

## 手工测试

### 后端 intent-confirm 单测

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-generalChat.test.ts server/__tests__/chat-route.test.ts
```

实测输出:

```text
PASS server/__tests__/skill-generalChat.test.ts
PASS server/__tests__/chat-route.test.ts
Test Suites: 2 passed, 2 total
Tests: 17 passed, 17 total
```

负样本:

```text
practicing 中 AI Router 不能降级到 general-chat:
返回 400 VALIDATION_FAILED,错误消息包含“不能降级到闲聊”。
```

### 前端 widget 单测

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

实测输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (29 tests)
Test Files 1 passed (1)
Tests 29 passed (29)
```

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

实测输出:

```text
[smoke:learn] === 12 scenarios ===
[smoke:learn] ✓ L 低置信度路由 → intent-confirm
[smoke:learn] PASSED 12 / 12
```

负样本:

```text
F grading 态调 scene-select → router state_not_allowed (502)
H /send 同时传 text + action → 400 VALIDATION_FAILED
```

### 全量单元测试

命令:

```bash
npm run test:unit
```

实测输出:

```text
Test Suites: 16 passed, 16 total
Tests: 95 passed, 95 total
Test Files 9 passed (9)
Tests 64 passed (64)
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
✓ 75 modules transformed.
✓ built in 1.70s
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

已跑过 6 / 6 步,全部通过;包含 3 个负向路径(练习态禁止闲聊降级、grading 非法状态动作、非法 text+action)。

## 遗留 TODO

- [后端] `general-chat` 的开放闲聊仍是规则化短回复,尚未接真实 LLM。
- [产品] intent choice 仍为状态模板,尚未结合 Router 返回的候选意图动态生成更细选项。
- [前端] 高风险确认的 checkbox/二次确认视觉只保留数据协议和样式基础,未接删除/归档等真实高风险动作。
- [测试] 可补 provider 真实低置信输出的端到端样本,当前 smoke 使用 ScriptedProvider。

## 下一阶段建议

1. **右侧辅助追问支线**(PRD §3.2)— 基于 `branch_threads` 和 `messages.branch_thread_id` 实现真正不打断主线的追问面板。
2. **归档与只读恢复**(PRD §3.1 / §3.5)— 实现 archived 会话只读、拒绝继续答题、复制总结和基于旧场景重练。
3. **单题降难替换**(PRD §2.6)— 第 2 次失败后自动生成同知识点降难替换题,补齐错题即时救援。
4. **general-chat 真实化**(PRD §2.2 / §2.3)— 在非锁定状态下接入低风险闲聊,并保持真实 Provider 错误显式暴露。
