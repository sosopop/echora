> 日期: 2026-05-17
> 序号: 011
> 任务: 调整聊天 widget 间距与场景生成 loading 显示

## 任务背景

用户反馈 AI 回复文字与下方小部件贴得太近;同时生成场景期间会先显示一个“无场景”的空小部件,生成完成后才切换成场景卡片,造成视觉闪烁。

## 执行摘要

- `src/views/Chat/index.module.css` — `.messageRow` 间距从 8px 提升到 16px,让 AI 文本和下方 widget 拉开距离。
- `src/components/widgets/SceneCards.tsx` — `scene-cards` 在 `loading` 等非 ready/error 状态下返回 `null`,生成期间不显示空候选提示。
- `src/views/Chat/WidgetSlot.tsx` — 额外兜底隐藏 loading 状态的 `scene-cards`,避免留下空 widget 容器。
- `src/__tests__/components/widgets/widgets.test.tsx` — 增加 `scene-cards loading` 不渲染空小部件的回归测试。
- `doc/knowledge/styling.md` — 同步 Chat widget 间距与场景卡片 loading 行为。

## 手工测试

### 前端聚焦测试

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/MessageList.test.tsx
```

实测输出:

```text
Test Files 2 passed (2)
Tests      12 passed (12)
```

负样本覆盖:

```text
scene-cards status='loading' 且 data={} 时,容器为空,不出现“还没有可用场景候选”。
```

### 前端全量测试

命令:

```bash
npm run test:web
```

实测输出:

```text
Test Files 8 passed (8)
Tests      40 passed (40)
```

观察:Vitest 仍会输出既有 profile 500 负样本日志与 React Router future flag warning,不影响通过结论。

### 构建与空白检查

命令:

```bash
npm run build
```

实测输出:

```text
✓ 70 modules transformed.
✓ built in 2.05s
```

命令:

```bash
git diff --check
```

实测输出:

```text
Exit code 0; only CRLF normalization warnings for modified files.
```

### 总结

已跑过 4 / 4 步,全部通过。未启动真实浏览器手工点击;本次可见行为由 jsdom 组件测试覆盖。

## 遗留 TODO

- [前端] 仍建议补真实浏览器 E2E 截图,验证场景生成期间只显示 assistant 文本,ready 后一次性出现卡片。
- [前端] 可继续细化不同 widget 类型与文本 bubble 的视觉节奏,例如 grading/exercise/scene 使用不同上间距。
- [产品] 场景生成较慢时可增加更自然的文本式进度反馈,不必依赖空 widget 占位。

## 下一阶段建议

1. **真实 UI 回归**(PRD §5.1)— 用浏览器自动化覆盖“生成场景 loading → cards ready”的可见链路,防止空 widget 闪回。
2. **生成进度文案**(PRD §2.3)— 场景生成耗时较长时输出自然短句进度,让等待更明确。
3. **Widget 节奏规范**(PRD §1.3 / §4.6)— 为不同 widget 类型沉淀统一间距和 loading 策略,减少对话流视觉突兀。
