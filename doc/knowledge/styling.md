# Styling

## 入口

- 设计 token:`src/styles/tokens.css`(从 `doc/design/styles/tokens.css` 拷贝)
- 公共组件样式:`src/styles/components.css`(从 `doc/design/styles/components.css` 拷贝)
- 在 `src/main.tsx` 顶部 `import` 注入全局样式
- 主题 store:`src/stores/theme.ts`

## 关键源码

### Token 命名

- 颜色:`--color-canvas` / `--color-primary` / `--color-msg-ai-bg` / `--color-success` 等
- 字体:`--font-display` / `--font-body` / `--font-mono`
- 间距:`--space-{xxs,xs,sm,md,lg,xl,xxl,section}`
- 圆角:`--radius-{xs,sm,md,lg,xl,pill}`
- 阴影:`--shadow-{sm,md,lg,popover}`
- 布局:`--layout-top-nav` / `--layout-col-history` / `--layout-col-main` / `--layout-col-branch`

### 主题切换

- 默认跟随系统 `@media (prefers-color-scheme: dark)`
- 用户手动:`documentElement.dataset.theme = 'light' | 'dark'`,写入 `localStorage.echora-theme`
- 与原型 `doc/design/scripts/interactions.js` 共用 localStorage key

## 约束与失败点

- **不引入 Tailwind / CSS-in-JS**:沿用 prototype 的 tokens + components,统一约定
- **不要硬编码十六进制色**:用 `var(--color-...)`,否则暗色模式断
- **品牌色与语义色双主题保持一致**:primary / success / warning / error 不在暗色下变色
- **Widget 协议样式在 `widget-preview.css`**:此文件仅用于原型预览,**不**进 src/styles
- **视图局部样式用 `*.module.css`**(Vite 原生支持,002 起约定):公共组件继续 global,视图层局部样式拆模块化(class hash 隔离),示例见 `src/views/Onboarding/index.module.css`
- **Chat 滚动锚定(008)**:`src/views/Chat/MessageList.tsx` 不使用 `scrollIntoView` 锚点,而是滚到 `document.scrollingElement.scrollHeight`;同时监听 message list 的 `ResizeObserver`,在 widget 从 loading 展开成 ready 后补滚。固定输入栏下方空间由 `src/views/Chat/index.module.css` 的 `.main` / `.messageList` padding 预留。
- **Chat 思考占位(008)**:`src/views/Chat/MessageBubble.tsx` 在 assistant 流式消息内容为空时显示 "Echo 正在思考中...",配合 store 的临时 assistant 消息形成「用户消息 → 思考中 → 小部件/结果」顺序。
- **批改卡片 loading(009)**:`grading-result` 在 `status='ready'` 且 `score/isCorrect` 都存在前不渲染结果卡,避免先出现 0 分再跳到真实分数;等待态由 assistant 文本承载。
- **场景卡片 loading(011)**:`scene-cards` 在 `status='loading'` 时不渲染空候选小部件,只保留 assistant 文本;`ready` 后一次性出现卡片,`error` 时才显示恢复提示。
- **Chat widget 间距(011)**:`src/views/Chat/index.module.css` 的 `.messageRow` gap 为 16px,让 AI 文本和其下方 widget 有更清楚的呼吸感。

## 测试入口

- 视觉回归测试 V1 不做(后续可接 Chromatic / Percy)
- 主题切换通过手工烟雾验证:启动 dev:web → 点 🌙/☀ 切换 → `localStorage.echora-theme` 被写入
- Chat 滚动行为:`src/__tests__/views/MessageList.test.tsx`
- Chat 消息顺序/思考占位:`src/__tests__/stores/chat.test.ts` + `src/__tests__/views/MessageBubble.test.tsx`
- 批改卡片 loading:`src/__tests__/components/widgets/widgets.test.tsx`
- 场景卡片 loading:`src/__tests__/components/widgets/widgets.test.tsx`

## Pending

- 未来 12 Widget 实现时是否拆出 `src/styles/widgets/` 子目录
