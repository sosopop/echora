> 日期: 2026-05-17
> 序号: 016
> 任务: 真实化降难重练 retry

## 任务背景

015 已经接通真实复盘和学习数据闭环,但 `progress-summary` 的重练建议仍不能进入可作答专项练习。按 PRD §2.6 的“重练题优先覆盖未掌握薄弱点”要求,本次把 `retry` 从 stub 改为可生成降难题并接入既有批改链路。

## 执行摘要

- `server/skills/retry.ts` — 真实化 retry Skill:从指定 tag、当前场景错误标签或低掌握度记录选薄弱点,生成 3 道内部 `stage=5` 的降难专项题。
- `server/services/attemptPrompt.ts` — 新增 attempt prompt 兼容 JSON 包装,让 retry 题在不加字段/不迁移的前提下稳定保存显示题干、参考答案和目标 tag。
- `server/skills/_helpers/gradeFsm.ts` — 批改 prompt 可解析 retry prompt 包装,优先使用结构化参考答案。
- `server/skills/grade.ts` — 对 `stage=5` 重练题单独处理:通过第 1/2 题后继续 retry,第 3 题后转 `reviewing`,不触发四阶段主线 `awaiting_next`。
- `server/routes/chat.ts` — `重练` / `重练错题` / `重练 <tag>` / `retry` 确定性路由到 `retry`;`activeSkill='retry'` 时 `next-question` 继续路由 retry。
- `src/components/widgets/ProgressSummary.tsx` — 建议卡片新增“开始”按钮:`retry:<tag>` 转文本 `重练 <tag>`,`request-new-scenes` 继续走结构化 action。
- `src/components/widgets/ExerciseCard.tsx` — 内部 `stage=5` 前端显示为“重练”,不暴露系统阶段号。
- `server/__tests__/skill-retry.test.ts` / `skill-grade.test.ts` / `chat-route.test.ts` / `widgets.test.tsx` / `tests/smoke/run-smoke-learning.ts` — 覆盖 retry 出题、路由、批改推进、前端入口和端到端闭环。
- `doc/knowledge/{skills,state-machine,api-contract,styling}.md` — 同步记录 retry 行为、stage 5 约定和测试入口。

## 手工测试

### 后端目标测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-retry.test.ts server/__tests__/skill-grade.test.ts server/__tests__/chat-route.test.ts
```

输出:

```text
PASS server/__tests__/skill-retry.test.ts
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-grade.test.ts
Test Suites: 3 passed, 3 total
Tests:       27 passed, 27 total
```

覆盖的负样本:

```text
retry 无 active scene → NO_ACTIVE_SCENE
retry 无薄弱点 → 友好提示且不显示空 exercise-card
needs_review attempt 再 submit → ATTEMPT_LOCKED
```

### 前端 widget 测试

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (17 tests)
Test Files  1 passed (1)
Tests       17 passed (17)
```

覆盖的负样本:

```text
重练题显示“重练”,不显示“阶段 5”
progress-summary loading 不显示空复盘卡
```

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] ✓ A 完整闭环(scene → 阶段 1-4 各 2 题 → awaiting_next → review → retry)
[smoke:learn] ✓ B 换一批 candidates 过滤已用 topic
[smoke:learn] ✓ C scene_history 累计 10 后第 11 次自动 prune
[smoke:learn] ✓ D 答错 → retry_count=1 + 无 state-transition
[smoke:learn] ✓ E 同题答错 2 次 → markNeedsReview
[smoke:learn] ✓ F grading 态调 scene-select → router state_not_allowed (502)
[smoke:learn] ✓ G 重复提交同 attempt(已标 needs_review 后) → ATTEMPT_LOCKED
[smoke:learn] ✓ H /send 同时传 text + action → 400 VALIDATION_FAILED
[smoke:learn] ✓ I provider chat 抛错 → SkillEvent error 直传客户端
[smoke:learn] ✓ J 阶段 1 两题全过后下题为阶段 2(mode=chat)
[smoke:learn] PASSED 10 / 10
```

### 单元集合

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 14 passed, 14 total
Tests:       84 passed, 84 total
Test Files  9 passed (9)
Tests       51 passed (51)
```

备注:

```text
测试期间出现既有的 apiClient mock 失败日志与 React Router future warning,不影响结果。
```

### 构建

命令:

```bash
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 71 modules transformed.
✓ built in 2.20s
```

### Diff 检查

命令:

```bash
git diff --check
```

输出:

```text
仅出现 Windows 工作区 LF/CRLF 提示,未报告 trailing whitespace 或 whitespace error。
```

### 总结

已跑过 6 / 6 组验证,全部通过。负样本覆盖无场景、无薄弱点、重复提交锁定、非法状态动作、provider 错误、loading widget 不占位。

## 遗留 TODO

- [后端] 单题第 2 次失败后仍不会自动生成降难替换题;当前 retry 需要用户从复盘/文本主动触发。
- [后端] retry 题模板是确定性 MVP,尚未按用户画像和最近场景动态生成更丰富题目。
- [前端] `answer-review` 单题回看仍未实现,重练前不能预览具体错题列表。
- [产品] `stage=5` 是内部约定,后续若引入更多专项训练类型需沉淀为更明确的 attempt kind。

## 下一阶段建议

1. **单题回看**(PRD §4.7)— 实现 `answer-review` widget,从 `grading_results` 展开每题答案、参考表达和错误标签,支撑复盘详情与 retry 启动前预览。
2. **自动降难替换题**(PRD §2.6)— 在同题第 2 次失败并 `markNeedsReview` 后自动调用 retry 出一题同 tag 降难替换题,减少用户被错题打断。
3. **会话锁定**(PRD §3.1)— 接入 `lock_policy` 与 `conversation-lock`,在练习/批改中隐藏历史答案,复盘后恢复。
4. **辅助追问支线**(PRD §3.2)— 基于 `follow-up-source` 实现批改解释支线,让用户追问但不打断主练习。
