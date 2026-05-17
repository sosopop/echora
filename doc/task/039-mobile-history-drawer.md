# 039 移动端历史会话抽屉

## 任务背景

PRD §4.1 要求移动端 `< 768px` 时历史会话和辅助追问收进抽屉。034/035 已经实现桌面历史左栏和新建入口,但窄屏下左栏被隐藏且没有打开方式。

## 执行摘要

- `Chat` 顶栏新增移动端历史按钮 `☰`,点击后打开历史会话抽屉。
- `HistoryPanel` 支持 `variant='drawer'` 和 `onClose`,抽屉模式显示关闭按钮。
- 移动端历史抽屉使用 fixed overlay + backdrop,宽度 `min(320px, 86vw)`。
- 抽屉中切换会话或新建会话后自动关闭。
- 桌面端 960px 以上隐藏顶栏历史按钮,继续使用左侧固定栏。
- 更新 `doc/knowledge/styling.md`。

## 手工测试

命令:

```bash
npx vitest run src/__tests__/views/HistoryPanel.test.tsx
```

观察输出:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

覆盖的正向场景:

- `HistoryPanel` 抽屉模式显示关闭按钮。
- 点击关闭按钮触发 `onClose`。
- 抽屉模式下切换非当前会话会调用 `selectConversation(id)` 并触发 `onClose`。

覆盖的负向场景:

- 点击当前会话仍不会重复触发 `selectConversation`。

## 遗留 TODO

- 顶栏移动端按钮尚未做完整 viewport 视觉回归,目前由单元测试覆盖组件交互。
- 辅助追问在窄屏下已经是 fixed 面板,但还没有统一抽屉导航管理。

## 下一阶段建议

继续补齐移动端辅助追问抽屉体验:统一历史抽屉和支线抽屉的层级、关闭行为与输入焦点恢复。
