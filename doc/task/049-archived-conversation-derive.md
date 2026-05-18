> 日期: 2026-05-18
> 序号: 049
> 任务: 归档会话派生为新学习流

## 任务背景

`doc/prd-gap-audit.md` 仍记录 archived 会话只能复盘、不能作为新学习流上下文引用。PRD §3.1 / §5.2 要求归档会话只读,但允许作为新学习流上下文引用,本次实现“基于旧场景再练”的正式入口。

## 执行摘要

- `shared/api.ts` — 新增 `ConversationDeriveResp` 响应类型。
- `server/services/sceneDialogue.ts` — 新增复制源会话最新 `scene_dialogue` 到目标会话的服务函数。
- `server/routes/chat.ts` — 新增 `POST /api/chat/conversations/:id/derive`;仅 archived 会话可派生,成功创建 `scene_selecting` 新会话并复制最近场景。
- `src/api/chat.ts` — 新增 `deriveConversation()` API 封装。
- `src/stores/chat.ts` — 新增 `deriveConversationFromArchived()`,派生后若场景复制成功则自动发送 `next-question`,否则退回 `request-new-scenes`。
- `src/views/Chat/HistoryPanel.tsx`、`src/views/Chat/index.module.css` — archived 历史会话显示“基于此再练”轻入口。
- `server/__tests__/chat-route.test.ts`、`src/__tests__/stores/chat.test.ts`、`src/__tests__/views/HistoryPanel.test.tsx` — 覆盖后端派生、前端 store 派生流与历史栏按钮。
- `doc/knowledge/api-contract.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/styling.md`、`doc/prd-gap-audit.md` — 同步 API、状态机、前端行为和剩余缺口。

## 手工测试

### 后端单测

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts -t "派生" --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests: 2 passed, 35 skipped, 37 total
```

### 前端单测

命令:

```powershell
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/HistoryPanel.test.tsx
```

观察输出:

```text
✓ src/__tests__/stores/chat.test.ts (13 tests)
✓ src/__tests__/views/HistoryPanel.test.tsx (5 tests)
```

### 构建

命令:

```powershell
npm run build
```

观察输出:

```text
✓ built in 1.94s
(!) Some chunks are larger than 500 kB after minification.
```

### 负样本

- `server/__tests__/chat-route.test.ts` 覆盖非 archived 会话调用 derive 返回 `400 VALIDATION_FAILED`。
- 若 archived 源会话没有场景,前端会退回 `request-new-scenes`,不进入空白练习。

### 总结

已跑过 3 / 3 步,全部通过。

## 遗留 TODO

- [后端] 派生新会话当前只复制最近场景,尚未把旧复盘摘要作为显式上下文提示展示在新会话首屏。
- [前端] “基于此再练”目前在历史栏中是轻按钮,后续可根据设计原型微调图标或 hover 说明。
- [测试] 尚未把归档派生加入 learning smoke。

## 下一阶段建议

1. **SSE 现代化**(PRD §2.8 / §3.4 / §5.1) — 迁移 `EventSource + ?token=` 到 fetch stream,并评估标准 `Last-Event-ID`。
2. **取消信号全链路传播**(PRD §3.5) — 继续核对所有长运行 skill/provider 调用。
3. **归档派生上下文增强**(PRD §3.1 / §5.2) — 在新会话首屏展示旧复盘摘要或薄弱点提示。
4. **Widget 样式目录拆分**(工程收尾项) — 若 widget 样式继续增长,再拆 `src/styles/widgets/`。

