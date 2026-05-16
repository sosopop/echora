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

## 测试入口

- 视觉回归测试 V1 不做(后续可接 Chromatic / Percy)
- 主题切换通过手工烟雾验证:启动 dev:web → 点 🌙/☀ 切换 → `localStorage.echora-theme` 被写入

## Pending

- React 组件层是否需要 CSS Modules 隔离(目前全 global)
- 未来 12 Widget 实现时是否拆出 `src/styles/widgets/` 子目录
