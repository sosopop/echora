> 日期: 2026-05-18
> 序号: 040
> 任务: 学习菜单与剩余菜单类 Widget 可用化

## 任务背景

PRD §4.6 要求输入区左侧菜单提供开始练习、复盘、重练、换场景和保存进度等入口;PRD §4.7 中 `learning-menu` / `account-gate` 也已经在共享 schema 中定义,但前端仍未正式渲染。

## 执行摘要

- `src/views/Chat/ChatInput.tsx` — 启用输入框左侧学习菜单,按当前学习态动态展示主线、复盘、重练、换场景和本地保存进度动作。
- `src/views/Chat/index.module.css` — 增加输入区菜单 popover、菜单项和保存提示样式。
- `src/components/widgets/actionProtocol.ts` — 新增前端统一动作协议解析,支持 `action:*`、`text:*`、`retry:*` 与 `local:save-progress`。
- `src/components/widgets/LearningMenu.tsx` — 新增正式 `learning-menu` 渲染组件。
- `src/components/widgets/AccountGate.tsx` — 新增正式 `account-gate` 渲染组件。
- `src/components/widgets/IntentConfirm.tsx`、`ProgressSummary.tsx`、`WidgetRenderer.tsx` — 复用统一动作协议并注册新组件,避免 fallback JSON。
- `src/__tests__/views/ChatInput.test.tsx`、`src/__tests__/components/widgets/widgets.test.tsx` — 增加菜单动作、负向禁用和新 widget 渲染测试。
- `doc/knowledge/styling.md`、`doc/knowledge/api-contract.md` — 同步记录菜单行为、widget 注册和动作协议。

## 手工测试

命令:

```bash
npx vitest run src/__tests__/views/ChatInput.test.tsx src/__tests__/components/widgets/widgets.test.tsx
```

观察输出:

```text
Test Files  2 passed (2)
Tests       44 passed (44)
```

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       112 passed, 112 total
Test Files  10 passed (10)
Tests       81 passed (81)
```

命令:

```bash
npm run build
```

观察输出:

```text
vite v5.4.21 building for production...
✓ 80 modules transformed.
✓ built in 1.88s
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

- `awaiting_next` 下打开学习菜单,点击“开始新场景”会发送 `request-new-scenes` 结构化动作。
- 点击“查看复盘”会发送文本 `复盘`,继续走既有确定性 review 路由。
- 点击“保存进度”只显示本地“当前进度已自动保存”提示,不发网络请求。
- `learning-menu` / `account-gate` 经 `WidgetRenderer` 渲染为正式组件,不再走 fallback JSON。

覆盖的负向场景:

- `practicing` 答题中菜单的“继续练习 / 查看复盘 / 复习薄弱点”禁用,避免把控制操作误提交为当前题答案。
- `learning-menu` / `account-gate` 在 `loading` 或缺少必需字段时返回空内容,不显示半成品小部件。

## 遗留 TODO

- [前端] 菜单浮层尚未接浏览器 viewport 视觉回归;目前由 jsdom 交互测试与 build 覆盖。
- [产品] `account-gate` 的隐私授权、删除账号等高风险 intent 仍属于 V1 后续扩展,本次只补正式渲染与按钮协议。

## 下一阶段建议

1. **移动端辅助追问抽屉完善**(PRD §4.1 / §3.2) — 历史抽屉已完成,下一步统一支线抽屉的遮罩、Esc 关闭、输入焦点与主输入栏恢复。
2. **加入复盘的支线显式记录**(PRD §3.2 / §2.6) — 让辅助追问中的用户确认内容写入结构化统计,补齐“加入复盘”闭环。
3. **自适应难度调节**(PRD §2.6) — 基于连续场景表现和“太难/太简单”文本调整下一题/下一场景难度。
4. **停止生成与恢复**(PRD §3.5 / §4.8) — 将发送按钮的停止态接到 AbortController,失败后保留当前学习态并允许重试。
