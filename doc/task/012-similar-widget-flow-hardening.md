> 日期: 2026-05-17
> 序号: 012
> 任务: 同类 Widget 与练习流问题加固

## 任务背景

根据近期修复的场景生成 loading、批改 loading、练习断流与控制文本分流问题,继续排查系统中是否存在同类"半成品小部件先显示"和"控制指令绕回 AI Router"的问题。

## 执行摘要

- `src/components/widgets/ExerciseCard.tsx` — 题卡在 `ready` 且 `attemptId/stage/questionNo/questionType/contextZh` 完整前不渲染,避免显示"阶段 ? / 第 ? 题"。
- `src/views/Chat/WidgetSlot.tsx` — 统一过滤 `status='loading'` 的 widget,并对题卡/批改卡做必填数据校验后才占用 widget 槽位。
- `server/routes/chat.ts` / `server/skills/sceneSelect.ts` — `practicing` 中输入 `换场景` / `换一批` / `重新生成场景` 直接路由到 `scene-select`,并先切回 `scene_selecting` 再展示场景卡片。
- `src/__tests__/views/WidgetSlot.test.tsx`、`src/__tests__/components/widgets/widgets.test.tsx`、`server/__tests__/chat-route.test.ts`、`server/__tests__/skill-sceneSelect.test.ts` — 补充半成品题卡隐藏、widget 槽位过滤、练习中换场景分流和状态切换测试。
- `doc/knowledge/styling.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/skills.md` — 同步记录新的 widget loading 防线和练习中换场景的状态机约定。

## 手工测试

### 针对性前端测试

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/WidgetSlot.test.tsx src/__tests__/views/ChatInput.test.tsx
```

观察输出:

```text
Test Files  3 passed (3)
Tests       20 passed (20)
```

负样本覆盖: `WidgetSlot.test.tsx` 验证 `loading exercise-card` 与缺少 `contextZh` 的 ready 题卡均不渲染,不会出现空 widget 槽位或"阶段 ?"半成品。

### 针对性后端测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/skill-sceneSelect.test.ts
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-sceneSelect.test.ts
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

负样本覆盖: `chat-route.test.ts` 验证 `practicing` 中输入 `换场景` 不会被包装为答案,也不会调用 AI Router,而是确定性进入 `scene-select`。

### 单元测试总入口

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 12 passed, 12 total
Tests:       67 passed, 67 total
Test Files  9 passed (9)
Tests       44 passed (44)
```

说明:测试中仍有既有 dev 诊断日志与 React Router future flag warning,不影响本次断言结果。

### 构建验证

命令:

```bash
npm run build
```

观察输出:

```text
tsc -p tsconfig.server.json && vite build
✓ built in 2.25s
```

### 总结

已跑过 4 / 4 步,全部通过。本次未包含 curl 步骤,无需配套 `012-test.py`。

## 遗留 TODO

- [前端] `progress-summary` 等尚未实现的 widget 仍走 fallback JSON,后续真实化 review skill 时应提供正式组件或更友好的占位。
- [后端] `explain` / `review` / `retry` 仍为 stub,未来接入真实逻辑时需要沿用本次的 loading/ready 渲染契约。
- [测试] 还没有浏览器级可视截图回归,后续可覆盖 widget 从 loading 展开为 ready 时的滚动与布局稳定性。

## 下一阶段建议

1. **补齐阶段 3-4 练习**(PRD §2.6) — 当前主线只覆盖 MVP 阶段 1-2,继续实现对话接龙与角色互换才能让练习真正连续。
2. **真实化复盘与重练**(PRD §2.2 / §2.6) — 将 `review` / `retry` 从 stub 接入结构化学习记录,避免结束后只能换场景。
3. **完善 Widget 组件覆盖**(PRD §1.3 / §2.8) — 为 `progress-summary`、后续 intent-confirm 等 widget 增加正式渲染组件,减少 fallback JSON 暴露给用户。
4. **增加浏览器烟雾脚本**(PRD §2.8) — 用真实 dev server 验证 SSE、widget 更新、页面滚动和输入禁用状态,更接近用户复现路径。
