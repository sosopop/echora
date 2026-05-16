> 日期: 2026-05-17
> 序号: 005
> 任务: 场景生成失败后的恢复入口

## 任务背景

用户反馈 DeepSeek 调用失败后,聊天界面停留在 `select` 输入模式,但 `scene-cards` widget 只有"暂无场景候选",没有可点击卡片或输入框,导致当前会话无法继续。根因是后端失败时只发 `error`,没有把已初始化的 widget 改成可恢复失败态,前端 `select` 模式又固定隐藏文本输入。

## 执行摘要

- `server/skills/sceneSelect.ts` - `runScenePropose` 失败时追加可读文本,把 `scene-cards` patch 为 `status='error'`,并发送 `mode-switch('chat')` 后再终止错误事件。
- `src/components/widgets/SceneCards.tsx` - 空候选/错误候选不再只显示占位文案,改为展示失败说明与"重新生成场景"按钮。
- `src/views/Chat/ChatInput.tsx` - `select` 模式仅在存在 ready 且非空的场景卡片时隐藏输入框;历史 loading/空候选/错误卡片会恢复文本输入与底部重试按钮。
- `src/components/widgets/widgets.module.css`、`src/views/Chat/index.module.css` - 补齐空候选卡片与底部恢复按钮样式。
- `server/__tests__/skill-sceneSelect.test.ts` - 更新 propose 失败路径断言,覆盖 widget error 与 mode-switch(chat)。
- `src/__tests__/components/widgets/widgets.test.tsx` - 覆盖空候选 widget 的重试按钮。
- `src/__tests__/views/ChatInput.test.tsx` - 新增 ChatInput 卡住态恢复测试。
- `doc/knowledge/skills.md` - 记录 scene-select 失败恢复事件序列和前端历史坏状态恢复行为。

## 手工测试

### scene-select 失败路径单测

命令(可直接复制粘贴):

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath server/__tests__/skill-sceneSelect.test.ts
```

输出:

```text
PASS server/__tests__/skill-sceneSelect.test.ts
  sceneSelect skill
    √ 无 action(默认)→ widget scene-cards + ready
    √ action=request-new-scenes → 候选过滤已用
    √ action=select-scene → 生成 dialogue + scene_history + state-transition
    √ propose 失败 → widget error + mode-switch(chat) + yield error
    √ dialogue 生成失败 → yield error,无 state-transition

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

负样本覆盖:

```text
propose 失败路径会产出 widget error + mode-switch(chat) + SCENE_PROPOSE_FAILED error。
结果: 用例通过,确认不会继续停留在不可操作的 select 模式。
```

### 前端恢复组件测试

命令(可直接复制粘贴):

```powershell
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/ChatInput.test.tsx
```

输出:

```text
✓ src/__tests__/views/ChatInput.test.tsx (2 tests)
✓ src/__tests__/components/widgets/widgets.test.tsx (8 tests)

Test Files  2 passed (2)
Tests       10 passed (10)
```

负样本覆盖:

```text
ChatInput.test.tsx: select 模式无候选时恢复文本输入并允许重新生成。
widgets.test.tsx: 空候选 SceneCards 点击"重新生成场景"会发送 request-new-scenes。
结果: 两个恢复入口均通过。
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
Test Files  6 passed (6)
Tests       27 passed (27)
```

### 构建验证

命令(可直接复制粘贴):

```powershell
npm run build
```

输出:

```text
✓ 69 modules transformed.
✓ built in 2.14s
```

### 浏览器检查

命令(可直接复制粘贴):

```powershell
npm run dev:web -- --host 127.0.0.1
```

浏览器操作与观察:

```text
访问 http://127.0.0.1:5173/
观察到登录页正常渲染: "欢迎回来 / 继续上次的英语练习 / 邮箱 / 密码 / 登录"。
当前环境未注入真实登录态,未直接进入用户截图中的会话;卡住态视觉由 ChatInput + SceneCards 组件测试覆盖。
```

### 总结

已跑过 6 / 6 步,全部通过。真实 DeepSeek 端到端仍需在配置 `<API_KEY>` 后复测"换场景"路径。

## 遗留 TODO

- [测试] 用真实 DeepSeek key 在现有坏会话中重新点击"重新生成场景",确认端到端可恢复并生成卡片。
- [后端] 结构化 action 当前仍先走 AI Router;后续可按 PRD §2.3 做确定性路由,减少"重新生成场景"对 Provider 路由能力的依赖。
- [前端] 可补一个可视化状态 fixture 或 Storybook 替代方案,让 widget loading/error/ready 三态更容易人工回归。

## 下一阶段建议

1. **结构化动作确定性路由**(PRD §2.3)— `request-new-scenes` / `select-scene` / `submit-answer` 等 action 不必先问 AI Router,可直接映射 Skill,降低 Provider 故障面。
2. **非法状态动作恢复**(PRD §3.5,§5.2)— 对 `grading` 中换场景、`archived` 中继续答题等路径补自然语言错误与输入模式恢复。
3. **场景生成重试策略**(PRD §2.5,§5.1)— `scene-select` 可在结构化 tool-use 缺失时自动重试一次或解析 JSON 文本,提高场景卡片成功率。
4. **UI 状态夹具**(PRD §4.7,§4.8)— 为核心 Widget 建立 loading/error/disabled/ready 固定样例,支撑人工视觉回归。
