> 日期: 2026-05-17
> 序号: 007
> 任务: 选场景后自动出题与练习态恢复

## 任务背景

用户反馈选中场景后,界面顶部已经进入"练习中",AI 也提示场景准备好了,但没有出现练习题,底部仍提示"请在上方点击场景卡片选择",导致会话再次卡住。根因是 `scene-select` 只生成并保存了 `scene_dialogue`,没有自动串接 `practice` 出第一题;旧场景卡片在 `practicing` 状态下仍可点击。

## 执行摘要

- `server/skills/sceneSelect.ts` - `select-scene` 成功生成 dialogue 后直接串接 `practiceSkill.handler`,同一条流里自动产出第一题、`exercise-card` 和正确输入模式。
- `server/routes/chat.ts` - 结构化 action 改为确定性路由:`request-new-scenes` / `select-scene` → `scene-select`,`submit-answer` → `grade`,`next-question` / `skip-question` → `practice`,并继续校验 allowedStates。
- `src/views/Chat/ChatInput.tsx` - 若历史会话已经处于 `practicing` 但仍遗留 `select` 输入模式,底部显示"开始练习"入口并发送 `next-question`。
- `src/components/widgets/SceneCards.tsx` - 非 `scene_selecting` / `awaiting_next` / `reviewing` 状态下禁用旧场景卡片,避免练习中继续点旧卡。
- `server/__tests__/skill-sceneSelect.test.ts`、`src/__tests__/views/ChatInput.test.tsx`、`src/__tests__/components/widgets/widgets.test.tsx` - 覆盖自动出题、练习态恢复入口和旧卡片禁用所需状态。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md` - 更新 action 确定性路由和 select-scene 自动串接 practice 的约定。

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

### 后端聚焦测试

命令(可直接复制粘贴):

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath server/__tests__/skill-sceneSelect.test.ts server/__tests__/skill-practice.test.ts
```

输出:

```text
PASS server/__tests__/skill-sceneSelect.test.ts
PASS server/__tests__/skill-practice.test.ts

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```

负样本覆盖:

```text
skill-sceneSelect.test.ts: dialogue 生成失败仍 yield error,无 state-transition。
skill-practice.test.ts: 无 scene_dialogue 时返回 NO_ACTIVE_SCENE。
结果: 两个失败路径均通过。
```

### 前端聚焦测试

命令(可直接复制粘贴):

```powershell
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/ChatInput.test.tsx src/__tests__/stores/chat.test.ts
```

输出:

```text
✓ src/__tests__/stores/chat.test.ts (2 tests)
✓ src/__tests__/views/ChatInput.test.tsx (3 tests)
✓ src/__tests__/components/widgets/widgets.test.tsx (8 tests)

Test Files  3 passed (3)
Tests       13 passed (13)
```

负样本覆盖:

```text
ChatInput.test.tsx: practicing 状态遗留 select 模式时显示"开始练习"并发送 next-question。
SceneCards widget: streaming 时按钮禁用。
结果: 用例通过。
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
Test Files  7 passed (7)
Tests       30 passed (30)
```

### 学习闭环 Smoke

命令(可直接复制粘贴):

```powershell
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] PASSED 10 / 10
```

覆盖:

```text
A 完整闭环(scene → 阶段 1*2 → 阶段 2*2 → awaiting_next)
B 换一批 candidates 过滤已用 topic
C scene_history 累计 10 后第 11 次自动 prune
F grading 态调 scene-select → router state_not_allowed (502)
I provider chat 抛错 → SkillEvent error 直传客户端
```

### 构建验证

命令(可直接复制粘贴):

```powershell
npm run build
```

输出:

```text
✓ 70 modules transformed.
✓ built in 2.04s
```

### 总结

已跑过 7 / 7 步,全部通过。真实浏览器中需重启 dev server 后刷新当前坏会话;若会话已有 active scene_dialogue 且仍停在 select 输入模式,底部应出现"开始练习"按钮。

## 遗留 TODO

- [前端] 旧场景卡片目前只是禁用,后续可在视觉上标记为"已进入练习"或折叠历史 widget。
- [后端] `skip-question` 仍只是确定性路由到 `practice`,尚未实现真正跳过并标记 attempt 的业务语义。
- [测试] 真实 DeepSeek UI 端到端仍需人工复测选场景后是否立即出现第一题。

## 下一阶段建议

1. **旧 Widget 生命周期收口**(PRD §4.7)— 选中场景后把原 `scene-cards` 标为 submitted/disabled,减少用户误点历史卡片。
2. **跳题语义实现**(PRD §2.6,§3.5)— `skip-question` 应锁定当前 attempt 并生成下一题,避免只是重新进 practice。
3. **练习态恢复按钮统一化**(PRD §3.5,§4.8)— 对 `practicing` / `grading` / `awaiting_next` 的不一致输入模式提供统一恢复动作。
4. **真实 Provider 回归**(PRD §5.1,§5.2)— 用真实 DeepSeek 配置覆盖"换一批 → 选场景 → 第一题 → 提交答案"完整 UI 路径。
