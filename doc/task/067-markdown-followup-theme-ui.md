> 日期: 2026-05-19
> 序号: 067
> 任务: 追问 Markdown 渲染、默认追问与账号菜单优化

## 任务背景

根据 `logs/server-debug.log` 和界面反馈,辅助追问回复中的 Markdown 没有在聊天列表里渲染成结构化内容;错误批改卡片也需要给出可直接点击的默认追问。同时继续打磨亮色/暗色切换与退出登录入口的 UI。

## 执行摘要

- `src/components/MarkdownText.tsx` — 新增轻量 Markdown 渲染组件,支持段落、加粗、列表、引用、代码块、行内代码和 http(s) 链接。
- `src/views/Chat/MessageBubble.tsx`、`src/views/Chat/BranchPanel.tsx`、`src/views/Chat/index.module.css` — assistant 主线消息和辅助追问回复改为 Markdown 渲染,并补齐 Markdown 元素样式。
- `src/components/widgets/GradingResult.tsx`、`src/views/Chat/MessageList.tsx`、`src/components/widgets/widgets.module.css` — 错误批改卡片按错误标签、用户答案、参考表达和解析生成最多 3 个默认追问;点击默认追问会打开右侧支线并自动发送问题,点击"追问"则只打开支线输入。
- `src/views/Chat/index.tsx`、`src/views/Chat/index.module.css` — 账号头像改为可聚焦 button,账号菜单升级为账号摘要 + 亮色/暗色/系统三段切换 + 危险色退出按钮。
- `doc/prd.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/styling.md` — 同步 Markdown、默认追问、账号菜单与支线行为契约。

## 手工测试

### 前端定向回归

命令:

```powershell
npx vitest run src/__tests__/views/MessageBubble.test.tsx src/__tests__/views/BranchPanel.test.tsx src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/MessageList.test.tsx src/__tests__/stores/chat.test.ts
```

输出:

```text
Test Files  5 passed (5)
Tests       62 passed (62)
```

结论:assistant Markdown 可渲染为加粗与列表;支线 assistant Markdown 可渲染;错误卡片默认追问按钮可打开支线并发送问题;手动追问只打开支线。

### 前端全量测试

命令:

```powershell
npm run test:web
```

输出:

```text
Test Files  13 passed (13)
Tests       100 passed (100)
```

结论:主题/退出菜单样式改动没有破坏现有前端路由、输入、组件和 store 行为。测试中仍有既有 React Router future flag 提醒和 profile store 失败路径日志,非本次阻断。

### 构建验证

命令:

```powershell
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 83 modules transformed.
✓ built in 2.50s
```

结论:服务端类型检查和前端生产构建通过。Vite 仍提示单个 chunk 超过 500 kB,属于既有体积提醒。

### 全量回归

命令:

```powershell
npm test
```

输出:

```text
Test Suites: 17 passed, 17 total
Tests:       159 passed, 159 total
Test Files  13 passed (13)
Tests       100 passed (100)
[smoke] PASSED 6/6
[smoke:onb] PASSED 13 / 13
[smoke:learn] PASSED 13 / 13
```

结论:后端、前端、基础 smoke、onboarding smoke 和 learning smoke 全部通过。负例覆盖:普通主线消息不出现追问入口;普通 locked 支线来源不传来源正文;批改卡片默认追问仍只影响支线,不改变主学习状态。

## 遗留 TODO

- [前端] Markdown 渲染是轻量实现,未支持表格、图片、任务列表等扩展语法。
- [前端] 本次通过 jsdom 组件测试验证 UI 行为,未执行真实浏览器截图验收。
- [产品] 默认追问目前基于标签规则生成,后续可让批改模型直接返回更贴合当前错因的候选问题。

## 下一阶段建议

1. **辅助追问**(PRD §3.2)— 支持支线回复流式展示,让默认追问点击后也有与主线一致的实时反馈。
2. **批改体验**(PRD §2.6)— 让 `grade_answer` 结构化返回 `followUpPrompts`,从模型端生成更贴合具体答案的 2-3 个追问。
3. **主题与账号体验**(PRD §4.2)— 将账号菜单复用到 onboarding/auth 页面,让未登录态也能切换主题。
4. **移动端辅助追问**(PRD §4.1)— 补右侧支线在窄屏下的遮罩、Esc/返回关闭和焦点恢复。
