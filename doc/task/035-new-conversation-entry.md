# 035 历史栏新建会话入口

## 任务背景

034 接入了桌面左侧历史会话栏,但用户只能切换已有会话,无法从当前页面开启新的学习流。PRD 的历史栏原型包含“新建对话”入口,且新会话不应停在空白页。

## 执行摘要

- `useChatStore` 新增 `startNewConversation()`。
- 新建会话时调用 `chatApi.createConversation({ learningState: 'scene_selecting' })`,清空当前消息和支线状态。
- 新建成功后自动发送 `{ type: 'request-new-scenes' }`,让新会话直接进入场景候选生成。
- `HistoryPanel` 增加“＋ 新建对话”按钮。
- 更新 `doc/knowledge/styling.md`。

## 手工测试

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/HistoryPanel.test.tsx
npm run test:unit
npm run build
git diff --check
```

观察输出:

```text
Test Files  2 passed (2)
Tests       10 passed (10)

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       112 passed, 112 total
Test Files  10 passed (10)
Tests       73 passed (73)

> echora@0.1.0 build
✓ built in 2.59s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 点击历史栏新建入口会调用 `startNewConversation()`。
- `startNewConversation()` 创建 `scene_selecting` 会话后自动发送 `request-new-scenes`。
- 新会话插入 conversations 首位,当前会话切换到新 id,聊天列表出现“换一批场景”用户消息。

覆盖的负向场景:

- 点击当前会话仍不会重复触发 `selectConversation`。

## 遗留 TODO

- 新会话标题仍为空,列表中显示 fallback `会话 #id`;后续可在选定场景后自动命名。
- 新建失败只写入全局 error,尚未在历史栏按钮旁显示局部错误态。

## 下一阶段建议

实现场景选定后的会话自动命名:用 `scene_dialogue.title` 或场景卡片标题更新 `conversations.title`,让历史列表不再只显示 `会话 #id`。
