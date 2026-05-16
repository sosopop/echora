> 日期: 2026-05-17
> 序号: 006
> 任务: Action 文案、流式 Widget 渲染与 Dev 调试信息

## 任务背景

用户反馈点击"换一批/重新生成场景"后,聊天气泡显示 `[action] {"type":"request-new-scenes"}` 不够友好;同时流式返回时只出现"我来根据你的画像准备几个场景",场景卡片要刷新页面后才出现。用户还希望 `npm run dev` 测试环境下能输出完整错误信息方便调试。

## 执行摘要

- `shared/api.ts` - 新增 `describeChatAction()`,统一把结构化 action 显示为自然文案。
- `server/routes/chat.ts` - action 消息持久化时使用自然文案;Provider 路由失败在 dev/test 环境返回 upstream 调试 details。
- `src/stores/chat.ts` - 前端乐观 action 消息使用自然文案;流式 `widget-init` / `widget-ready` / `widget-update` 同步写入当前 assistant 消息的 `widgetSnapshot`,避免必须刷新后才看到卡片。
- `src/views/Chat/MessageBubble.tsx` - 兼容历史 `[action] {...}` 消息,渲染时转为自然文案。
- `server/utils/devError.ts`、`server/middleware/error.ts`、`src/api/client.ts`、`src/api/sse.ts`、`shared/skill.ts` - dev/test 环境下为 HTTP/SSE 错误附加并输出调试 details;生产环境不输出 stack/debug details。
- `src/__tests__/stores/chat.test.ts`、`src/__tests__/views/MessageBubble.test.tsx` - 覆盖 action 文案与流式 widgetSnapshot 即时挂载。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md` - 更新 action 显示、dev 错误 details、前端 widget 流式消费约束。

## 手工测试

### 服务端类型检查

命令(可直接复制粘贴):

```powershell
npx tsc -p tsconfig.server.json --noEmit
```

输出:

```text
(无输出,退出码 0)
```

### 前端聚焦测试

命令(可直接复制粘贴):

```powershell
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/MessageBubble.test.tsx src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/ChatInput.test.tsx
```

输出:

```text
✓ src/__tests__/stores/chat.test.ts (2 tests)
✓ src/__tests__/views/MessageBubble.test.tsx (1 test)
✓ src/__tests__/views/ChatInput.test.tsx (2 tests)
✓ src/__tests__/components/widgets/widgets.test.tsx (8 tests)

Test Files  4 passed (4)
Tests       13 passed (13)
```

负样本覆盖:

```text
MessageBubble.test.tsx: 历史 raw action 文本 `[action] {"type":"request-new-scenes"}` 会显示为"换一批场景"。
chat.test.ts: 流式 widget-ready 到达后,assistant 消息立即拥有 ready 状态的 widgetSnapshot。
结果: 两个用例均通过。
```

### 后端聚焦测试

命令(可直接复制粘贴):

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath server/__tests__/skill-sceneSelect.test.ts server/__tests__/openai-provider.test.ts server/__tests__/anthropic-provider.test.ts
```

输出:

```text
PASS server/__tests__/skill-sceneSelect.test.ts
PASS server/__tests__/openai-provider.test.ts
PASS server/__tests__/anthropic-provider.test.ts

Test Suites: 3 passed, 3 total
Tests:       15 passed, 15 total
```

### 完整后端测试

命令(可直接复制粘贴):

```powershell
npm run test:server
```

输出:

```text
Test Suites: 11 passed, 11 total
Tests:       56 passed, 56 total
```

### 完整前端测试

命令(可直接复制粘贴):

```powershell
npm run test:web
```

输出:

```text
✓ src/__tests__/stores/chat.test.ts (2 tests)
✓ src/__tests__/views/MessageBubble.test.tsx (1 test)
✓ src/__tests__/views/ChatInput.test.tsx (2 tests)
✓ src/__tests__/components/widgets/widgets.test.tsx (8 tests)

Test Files  7 passed (7)
Tests       29 passed (29)
```

观察到的 dev 错误输出:

```text
[apiClient] request failed {
  method: 'GET',
  path: '/profile',
  status: 500,
  error: { code: 'X', message: 'boom' }
}
```

### 构建验证

命令(可直接复制粘贴):

```powershell
npm run build
```

输出:

```text
✓ 70 modules transformed.
✓ built in 1.81s
```

### 总结

已跑过 6 / 6 步,全部通过。真实 DeepSeek UI 端到端仍需在本机配置 `<API_KEY>` 后重新点击"换一批/重新生成场景"确认。

## 遗留 TODO

- [后端] 结构化 action 仍会进入 AI Router;后续应改为确定性路由,避免 action 操作依赖 Provider 路由。
- [前端] dev 错误 details 目前会直接显示在错误提示中;后续可做可折叠调试面板,避免长 stack 影响布局。
- [测试] 需要在真实 DeepSeek 配置下跑 UI "换一批"端到端,确认无需刷新即可出现卡片。

## 下一阶段建议

1. **结构化动作确定性路由**(PRD §2.3)— action 直接映射到目标 Skill,减少 Provider 调度失败和不必要 token 消耗。
2. **调试面板**(PRD §3.3,§4.8)— dev 模式把 API/SSE details 放入可展开调试区,保留完整错误同时不干扰普通 UI。
3. **流式 Widget 回归夹具**(PRD §2.8,§4.7)— 为 `widget-init`→`widget-ready` 建立固定 UI 测试页,防止再次出现刷新后才可见的问题。
4. **真实 Provider E2E**(PRD §3.5,§5.1)— 用 DeepSeek/OpenAI/Anthropic 分别覆盖场景生成、对话生成、批改三条核心链路。
