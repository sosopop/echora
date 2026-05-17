# 038 选定场景携带卡片元数据

## 任务背景

036 已在选定场景后把会话标题更新为场景标题,但由于 `select-scene` action 只传 `sceneId`,后端只能把 `restaurant-ordering` 推导成 `Restaurant Ordering`。这导致历史左栏仍不如场景卡片上的中文标题友好。

## 执行摘要

- 扩展 `shared/api.ts` 的 `select-scene` payload,在 `sceneId` 外允许 `title/description/knowledgePoint/difficulty/topic`。
- 扩展 `/api/chat/send` 的 `chatActionSchema`,兼容新 payload。
- `SceneCards` 点击卡片时随 action 带上卡片标题、描述、知识点和难度。
- `scene-select` 的 `select-scene` 分支优先把 payload 元数据转成 `SceneCandidate`;旧客户端只传 `sceneId` 时仍保留 fallback。
- `shared/widget.ts` 的 `SceneCardSchema.difficulty` 从旧的 easy/medium/hard 改为 CEFR(A1-C2),对齐后端实际下发。
- 更新 `doc/knowledge/api-contract.md` 与 `doc/knowledge/skills.md`。

## 手工测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-sceneSelect.test.ts server/__tests__/chat-route.test.ts --runInBand
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/stores/chat.test.ts
npm run test:unit
npm run build
git diff --check
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-sceneSelect.test.ts
Tests:       31 passed, 31 total
Test Suites: 2 passed, 2 total

Test Files  2 passed (2)
Tests       39 passed (39)

> echora@0.1.0 test:unit
Test Suites: 16 passed, 16 total
Tests:       112 passed, 112 total
Test Files  10 passed (10)
Tests       74 passed (74)

> echora@0.1.0 build
✓ built in 2.68s

git diff --check
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- 场景卡点击发送 `select-scene` action 时包含中文 title、description、difficulty。
- 后端选定场景后 `scene_dialogue.title` 和 `conversations.title` 使用卡片中文标题。

覆盖的负向场景:

- `chat-route` 仍接受既有只含 `sceneId` 的 action,保持旧客户端和 smoke 流程兼容。

## 遗留 TODO

- `sourceRef.topic` 暂未从前端卡片传入,后端默认从 sceneId 推导 topic。
- 历史会话标题已经能用中文卡片标题,但候选卡片本身仍不持久化,刷新后无法复原当时的候选池。

## 下一阶段建议

若要进一步提高历史可回溯性,可新增候选池持久化或把选中卡片元数据写入 `scene_dialogues` 的扩展字段,用于复盘和历史详情展示。
