> 日期: 2026-05-17
> 序号: 013
> 任务: 补齐四阶段练习主线

## 任务背景

根据 PRD §2.6 与 012 的下一阶段建议,将当前只覆盖阶段 1-2 的练习闭环扩展为阶段 1-4:填空、整句翻译、对话接龙、角色互换。

## 执行摘要

- `server/skills/_helpers/practiceFsm.ts` — 将 `MAX_STAGE_MVP` 扩展为 4,新增 `dialogue_chain` 与 `role_reversal` 题型构造,阶段 3/4 短对话可复用相邻 turn。
- `server/skills/practice.ts` / `server/skills/grade.ts` — 出题与批改完成条件改为 4 阶段闭环;阶段 4 答对后可展示下一句对方回应。
- `shared/widget.ts` / `src/components/widgets/ExerciseCard.tsx` — 共享题型枚举补齐新题型,题卡展示「对话接龙」「角色互换」标签。
- `server/__tests__/skill-practice.test.ts`、`server/__tests__/skill-grade.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx`、`tests/smoke/run-smoke-learning.ts` — 扩展 4 阶段推进、阶段 4 完成、错题重试和前端标签测试。
- `doc/knowledge/skills.md`、`doc/knowledge/state-machine.md` — 同步记录 4 阶段练习主线与完成条件。

## 手工测试

### 后端聚焦单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts server/__tests__/skill-grade.test.ts
```

观察输出:

```text
PASS server/__tests__/skill-practice.test.ts
PASS server/__tests__/skill-grade.test.ts
Test Suites: 2 passed, 2 total
Tests:       18 passed, 18 total
```

覆盖:阶段 2 完成后进入阶段 3,阶段 3 完成后进入阶段 4,阶段 4 完成后进入 `awaiting_next`;负样本覆盖阶段 4 答错只增加 `retry_count=1` 且不做状态跳转。

### 前端聚焦单元

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

观察输出:

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

覆盖:题卡继续隐藏 loading 半成品,并正确显示 `dialogue_chain` / `role_reversal` 标签。

### 学习闭环 Smoke

命令:

```bash
npm run test:smoke:learning
```

观察输出:

```text
[smoke:learn] ✓ A 完整闭环(scene → 阶段 1-4 各 2 题 → awaiting_next) (1768ms)
[smoke:learn] ✓ F grading 态调 scene-select → router state_not_allowed (502) (75ms)
[smoke:learn] ✓ H /send 同时传 text + action → 400 VALIDATION_FAILED (73ms)
[smoke:learn] PASSED 10 / 10
```

负样本覆盖:`grading` 中切场景仍被状态校验拒绝;`text + action` 同传仍返回 400。

### 单元总入口

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 12 passed, 12 total
Tests:       71 passed, 71 total
Test Files   9 passed (9)
Tests        46 passed (46)
```

说明:测试中仍有既有 React Router future flag warning 与 profile store 500 诊断日志,均为现有测试预期路径。

### 构建验证

命令:

```bash
npm run build
```

观察输出:

```text
tsc -p tsconfig.server.json && vite build
✓ built in 1.76s
```

### 空白检查

命令:

```bash
git diff --check
```

观察输出:

```text
无空白错误;仅提示 Windows 工作区 LF 将被 Git 触碰时替换为 CRLF。
```

### 诊断记录

- 现象:前端新增「角色互换」测试最初用 `getByText(/角色互换/)`,同时命中题型标签与题干文本。
- 根因:同一关键字在 header 与 context 中都合理出现。
- 处置:测试改用 `getAllByText(/角色互换/)` 验证至少出现一次,避免误把正常重复文案当失败。

### 总结

已跑过 6 / 6 步,全部通过。本次未包含 curl 步骤,无需配套 `013-test.py`。

## 遗留 TODO

- [后端] 错题第 2 次失败后的降难替换题仍未实现,当前仍标记 `needs_review` 后继续主线。
- [后端] `mastery_records` 与 `error_tag_events` 仍未写入,复盘/重练真实化还缺数据闭环。
- [前端] 阶段 3/4 复用 `exercise-card`,尚未做专属对话式视觉增强。
- [产品] 完整自由对话接龙与多轮角色互换仍为后续增强,本次实现为单题式 chat 作答。

## 下一阶段建议

1. **真实化复盘报告**(PRD §2.2 / §4.7)— 基于本次 8 题结果实现 `review` 与 `progress-summary`,让完成后有总结而不是只换场景。
2. **错误标签与掌握度写入**(PRD §2.6 / §2.7)— 将批改 tags 写入结构化表,为复盘和重练提供事实数据。
3. **降难替换题**(PRD §2.6)— 对 `needs_review` 后的薄弱点生成更简单的同知识点题,避免用户被错题体验打断。
4. **辅助追问支线**(PRD §3.2)— 在主练习流已完整后补右侧支线,支持不改变主线的解释与追问。
