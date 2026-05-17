# 036 场景选定后自动命名会话

## 任务背景

035 新建会话后会自动请求场景候选,但历史左栏仍可能长期显示 `会话 #id`。PRD 的历史会话列表需要帮助用户回到具体学习上下文,因此在场景选定并生成对话后应把会话标题更新为场景标题。

## 执行摘要

- `server/services/conversation.ts` 新增 `updateConversationTitle(db, id, title)`。
- `scene-select` 在 `select-scene` 分支成功创建 `scene_dialogue` 后调用 `updateConversationTitle`,把标题写入 `conversations.title`。
- `skill-sceneSelect.test.ts` 覆盖选定场景后会话标题变为场景标题。
- 更新 `doc/knowledge/skills.md`。

## 手工测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-sceneSelect.test.ts --runInBand
npm run test:unit
npm run build
git diff --check
```

观察输出:

```text
PASS server/__tests__/skill-sceneSelect.test.ts
Tests:       6 passed, 6 total
Test Suites: 1 passed, 1 total

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       112 passed, 112 total
Test Files  10 passed (10)
Tests       73 passed (73)

> echora@0.1.0 build
✓ built in 2.54s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- `select-scene` 成功生成 `scene_dialogue` 后,`conversations.title` 更新为场景标题。
- 既有 `scene_history` 记录和自动出第一题仍保持正常。

覆盖的负向场景:

- dialogue 生成失败时不会产生 `state-transition`,也不会创建 active scene dialogue。

## 遗留 TODO

- 由于当前 `select-scene` action 只传 `sceneId`,后端标题仍由 sceneId 推导,可能是英文 Title Case,不是原始候选卡片中文标题。
- 前端 conversations 列表不会在 scene-select SSE 完成后自动 reload,标题刷新可能要等下一次加载会话。

## 下一阶段建议

扩展 `select-scene` action payload 或后端候选缓存,让选定场景时能使用原候选卡片的中文 title / description / knowledgePoint,并在前端收到场景选定完成后刷新会话列表。
