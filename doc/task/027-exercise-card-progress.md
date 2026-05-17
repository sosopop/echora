> 日期: 2026-05-17
> 序号: 027
> 任务: 练习题卡进度显示

## 任务背景

PRD §2.6 要求练习按四阶段连续推进,但题卡此前只显示"阶段 N / 第 N 题",用户不容易判断当前阶段还剩多少题。本次为 `exercise-card` 补充轻量进度信息。

## 执行摘要

- `server/skills/practice.ts` — 主线题卡下发 `totalStages=4` 与 `stageGoal=2`。
- `server/skills/retry.ts` — 专项重练下发 `stageGoal=3`,自动替换题下发 `stageGoal=1`。
- `shared/widget.ts` — `exercise-card.data` 增加 `totalStages?: number`、`stageGoal?: number`。
- `src/components/widgets/ExerciseCard.tsx`、`widgets.module.css` — 题卡显示"阶段 N/4"、"第 N/M 题"和短进度条;重练/替换题不暴露内部 stage 5。
- `server/__tests__/skill-practice.test.ts`、`server/__tests__/skill-retry.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx` — 覆盖协议字段和前端显示。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/styling.md` — 同步题卡进度协议与样式约定。

## 手工测试

### 后端单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts server/__tests__/skill-retry.test.ts
```

输出:

```text
PASS server/__tests__/skill-practice.test.ts
PASS server/__tests__/skill-retry.test.ts
Test Suites: 2 passed, 2 total
Tests: 15 passed, 15 total
```

### 前端单元

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (31 tests)
Test Files 1 passed (1)
Tests 31 passed (31)
```

负样本:替换题 widget 使用内部 `stage=5` 且 `remediationKind='replacement'`,断言前端显示"替换题 / 第 1/1 题",并且不显示"重练"或"阶段 5"。

### 全量单元

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 102 passed, 102 total
Test Files 9 passed (9)
Tests 67 passed (67)
```

### 构建

命令:

```bash
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ built in 2.66s
```

### Diff 空白检查

命令:

```bash
git diff --check
```

输出:

```text
warning: in the working copy of '...', LF will be replaced by CRLF the next time Git touches it
```

结论:仅有 Windows 行尾提示,无 whitespace error。已跑过 5 / 5 步,全部通过。

## 遗留 TODO

- [前端] 进度条目前是题内短条,还没有整场四阶段总览或顶部进度轨。
- [后端] 每阶段题数仍是常量 `STAGE_GOAL=2`,尚未根据难度/Profile 动态调整到 PRD 的 5-10 题弹性范围。
- [产品] 替换题通过后是否在后续复盘中展示"已补救"状态尚未定义。

## 下一阶段建议

1. **动态题量与难度**(PRD §2.6)— 从固定每阶段 2 题推进到按等级/表现生成 5-10 题,并维护 `difficultyScore`。
2. **自由对话接龙增强**(PRD §2.6)— 阶段 3/4 从单题式问答推进到连续多轮角色扮演。
3. **辅助追问右侧支线**(PRD §3.2)— 接入 `branch_threads`,让 explain 追问进入右侧支线而不是主流。
4. **复盘非分数化**(PRD §2.2 / §4.7)— 用三档分布、薄弱点趋势和达标项替代平均分展示。
