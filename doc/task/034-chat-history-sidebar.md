# 034 聊天历史会话左栏

## 任务背景

PRD 首页描述要求桌面端聊天界面可以展开左侧历史会话与右侧辅助追问,形成三栏学习工作台。031 已接入右侧辅助追问,但 `Chat` 仍只显示主学习流,虽然 store 已加载 conversations,用户无法直接在当前页面切换历史会话。

## 执行摘要

- 新增 `src/views/Chat/HistoryPanel.tsx`,展示当前用户会话列表、数量、学习态标签和归档标记。
- 历史会话项点击后调用 `selectConversation(id)`,当前会话点击不会重复加载。
- `Chat` 布局接入 `HistoryPanel`。
- `index.module.css` 增加桌面左栏布局:
  - 960px 以上显示 260px 历史栏。
  - 固定输入栏左侧同步让出 260px。
  - 1280px 以上且支线打开时显示 260px 历史栏 + 主学习流 + 360px 支线三栏。
- 更新 `doc/knowledge/styling.md`。

## 手工测试

命令:

```bash
npx vitest run src/__tests__/views/HistoryPanel.test.tsx src/__tests__/views/MessageList.test.tsx
npm run test:unit
npm run build
git diff --check
```

观察输出:

```text
Test Files  2 passed (2)
Tests       6 passed (6)

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       112 passed, 112 total
Test Files  10 passed (10)
Tests       71 passed (71)

> echora@0.1.0 build
✓ built in 2.56s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 历史会话列表显示标题、fallback 标题和数量。
- 点击非当前会话会调用 `selectConversation(id)`。

覆盖的负向场景:

- 点击当前会话不会重复触发 `selectConversation`。

## 遗留 TODO

- 左栏搜索、新建对话按钮和移动端抽屉尚未接入。
- 会话标题仍依赖后端已有 title 或 fallback `会话 #id`,暂未根据场景自动重命名。

## 下一阶段建议

继续完善历史会话管理:新增“新建对话”入口,并在移动端把历史会话与辅助追问收进抽屉,对齐 PRD 的响应式要求。
