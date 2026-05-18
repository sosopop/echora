> 日期: 2026-05-18
> 序号: 044
> 任务: 辅助追问加入复盘

## 任务背景

PRD §3.2 要求辅助追问默认不影响主线统计,但用户明确选择“加入复盘”后,应把确认的错因写入结构化学习记录。此前支线追问已经有右侧面板、多轮上下文和真实 Provider,但“加入复盘”仍停留在 TODO。

## 执行摘要

- `server/routes/chat.ts` — 新增 `POST /api/chat/branch-threads/:threadId/review`,只允许已批改且带错误标签的支线来源加入复盘;接口幂等补写缺失 `error_tag_events(included_in_stats=1)`,并只对新增事件更新 `mastery_records`。
- `server/services/errorTagEvent.ts` — 导出错误标签规范化能力,新增 `ensureErrorTagEvents`,避免重复点击导致重复计数。
- `server/skills/explain.ts`、`shared/widget.ts` — 已批改且有错误标签的 `follow-up-source` 增加 `reviewContext(attemptId/gradingId/tags)`,供支线面板判断是否可加入复盘。
- `shared/api.ts`、`src/api/chat.ts`、`src/stores/chat.ts` — 新增支线加入复盘响应类型、API client 与 store 状态。
- `src/views/Chat/BranchPanel.tsx`、`src/views/Chat/index.module.css` — 在已批改来源上显示“加入复盘”按钮,成功后在来源块展示确认文案。
- `server/__tests__/chat-route.test.ts`、`src/__tests__/stores/chat.test.ts`、`src/__tests__/views/BranchPanel.test.tsx` — 覆盖后端幂等、普通来源拒绝、store 调用与按钮显示。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/styling.md` — 同步 API、状态隔离、样式和测试入口。

## 手工测试

### 后端与前端聚焦测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/skill-explain.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-explain.test.ts
Test Suites: 2 passed, 2 total
Tests:       34 passed, 34 total
```

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/BranchPanel.test.tsx
```

观察输出:

```text
Test Files  2 passed (2)
Tests       12 passed (12)
```

### 全量单测

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       123 passed, 123 total
Test Files  11 passed (11)
Tests       86 passed (86)
```

### Smoke

命令:

```bash
npm run test:smoke:learning
```

观察输出:

```text
[smoke:learn] PASSED 13 / 13
```

### 构建与格式检查

命令:

```bash
npm run build
```

观察输出:

```text
✓ built in 2.16s
(!) Some chunks are larger than 500 kB after minification.
```

命令:

```bash
git diff --check
```

观察输出:

```text
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 已批改来源且带 `grading-result.attemptId/tags` 时,支线面板显示“加入复盘”按钮。
- 点击后调用 `/api/chat/branch-threads/:threadId/review`,新增缺失错因事件并更新对应掌握度。
- 重复点击返回 `createdEventsCount=0/existingEventsCount=1`,不会重复写统计。

覆盖的负向场景:

- 普通消息来源不会显示“加入复盘”按钮。
- 普通支线来源调用后端加入复盘接口返回 `400 VALIDATION_FAILED`,不会污染学习统计。

## 遗留 TODO

- [后端] 当前“加入复盘”只写入错误标签和掌握度,尚未把支线解释摘要作为独立复盘备注保存。
- [前端] 支线面板仍是同步 HTTP 追问,尚未支持支线回复流式展示。
- [测试] smoke learning 尚未覆盖用户在真实 UI 中打开支线并点击“加入复盘”的跨层流程。

## 下一阶段建议

1. **动态题量**（PRD §2.6）— 把固定每阶段 2 题升级为按等级和表现分配 5-10 题,让四阶段主线更贴近需求原文。
2. **移动端辅助追问抽屉完善**（PRD §4.1 / §3.2）— 当前支线在窄屏是 fixed 覆盖层,下一步补遮罩、Esc 关闭和焦点恢复。
3. **支线解释摘要入复盘**（PRD §3.2）— 在错误标签之外记录用户确认的解释摘要,让复盘能展示“为什么这条被加入”。
4. **自动归档策略**（PRD §3.1 / §3.5）— 明确练习完成、复盘后何时归档旧会话,减少历史列表长期混杂 active 会话。
