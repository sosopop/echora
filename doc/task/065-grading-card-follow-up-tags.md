> 日期: 2026-05-19
> 序号: 065
> 任务: 批改卡片中文标签与追问入口收敛

## 任务背景

用户反馈批改卡片里 `collocation` / `missing_word` 等英文错误标签不够友好,并希望追问只出现在 AI 批改卡片上,用于继续理解卡片中的解析,普通对话内容不再提供追问入口。

## 执行摘要

- `src/components/widgets/tagLabels.ts` — 新增错误标签中文映射,保留英文枚举作为底层统计与重练协议。
- `src/components/widgets/GradingResult.tsx`、`ProgressSummary.tsx`、`AnswerReview.tsx` — 将错误标签展示改为中文;批改卡片新增卡片内“追问”按钮。
- `src/views/Chat/MessageBubble.tsx`、`MessageList.tsx`、`WidgetSlot.tsx`、`WidgetRenderer.tsx`、`index.module.css` — 移除普通消息气泡追问入口,仅从批改卡片打开支线;打开时携带情景上下文、AI 问题、用户答案、参考表达、AI 解析和标签。
- `src/stores/chat.ts`、`src/views/Chat/BranchPanel.tsx` — 增加 `openBranchForWidget` 并按 `sourceRef` 匹配支线,右侧支线来源优先展示批改卡片摘要。
- `server/routes/chat.ts` — 支线 Provider prompt 读取 `sourceRef.kind='grading-result'` 的结构化上下文;普通消息来源在 locked 状态下仍隐藏正文。
- `src/__tests__/components/widgets/widgets.test.tsx`、`src/__tests__/views/MessageList.test.tsx`、`src/__tests__/stores/chat.test.ts`、`server/__tests__/chat-route.test.ts` — 覆盖中文标签、卡片内追问、普通消息无追问、批改上下文传递和锁定态负例。
- `doc/prd.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/styling.md`、`doc/knowledge/skills.md`、`doc/knowledge/state-machine.md` — 同步追问入口和标签展示契约。

## 手工测试

### 前端定向回归

命令:

```powershell
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/MessageList.test.tsx src/__tests__/stores/chat.test.ts src/__tests__/views/BranchPanel.test.tsx
```

输出:

```text
Test Files  4 passed (4)
Tests       58 passed (58)
```

结论:批改卡片展示中文标签,卡片内“追问”按钮能创建带上下文的支线;普通消息气泡不再提供追问入口。

### 后端支线回归

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand server/__tests__/chat-route.test.ts
```

输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests: 46 passed, 46 total
```

结论:批改卡片来源在 locked 状态下仍携带已批改结构化上下文;普通消息来源 locked 时不传来源正文,避免泄露当前题答案。

### 全量测试

命令:

```powershell
npm test
```

输出:

```text
Test Suites: 17 passed, 17 total
Tests:       159 passed, 159 total
Test Files  13 passed (13)
Tests       98 passed (98)
[smoke] PASSED 6/6
[smoke:onb] PASSED 13 / 13
[smoke:learn] PASSED 13 / 13
```

结论:后端、前端、基础 smoke、onboarding smoke 和 learning smoke 全部通过。测试中仍出现既有 `JWT_SECRET` 开发默认值告警、React Router future flag 提醒和 profile store 失败路径日志,均非本次阻断。

### 构建验证

命令:

```powershell
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 82 modules transformed.
✓ built in 2.03s
```

结论:服务端类型检查和前端生产构建通过。Vite 仍提示单个 chunk 超过 500 kB,属于既有体积提醒。

## 遗留 TODO

- [前端] 本次未做真实浏览器截图验收;已用组件测试覆盖 DOM 行为和上下文参数。
- [后端] `sourceRef` 仍是开放 JSON 结构,后续若支线来源类型继续扩展,可补 zod schema 收窄。
- [产品] 中文标签文案后续可结合学习报告做更口语化解释,例如在 hover 或详情中补英文枚举和例句。

## 下一阶段建议

1. **辅助追问**(PRD §3.2)— 为批改卡片追问预置快捷问题,例如“为什么错”“怎么更自然”,降低用户输入成本。
2. **批改体验**(PRD §2.6)— 给中文错误标签增加简短说明或示例,让用户不进入支线也能快速理解错因。
3. **复盘与重练**(PRD §2.7)— 在复盘卡片里统一中文标签展示,同时保留英文 tag action,继续打通“中文可读、协议稳定”的体验。
4. **移动端辅助追问**(PRD §4.1)— 对右侧支线在窄屏下补遮罩、关闭焦点恢复和来源摘要压缩,提升手机端可用性。
