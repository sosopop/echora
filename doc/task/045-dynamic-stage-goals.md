> 日期: 2026-05-18
> 序号: 045
> 任务: 按场景难度动态分配四阶段题量

## 任务背景

PRD §2.6 要求一次场景学习默认包含 5-10 个计分题,阶段 1-2 各 1-3 题、阶段 3-4 各 1-2 题。此前四阶段主线已经接通,但所有主线场景仍固定每阶段 2 题,无法区分 A1/A2、B1/B2、C1/C2 的练习强度。

## 执行摘要

- `server/services/stageGoal.ts` — 新增阶段题量计划服务:A1/A2 为 5 题(2/1/1/1),B1/B2 为 8 题(2/2/2/2),C1/C2 为 10 题(3/3/2/2),并提供总题量与单阶段读取工具。
- `server/skills/_helpers/practiceFsm.ts`、`server/skills/practice.ts` — `decideNextQuestion` 改为按当前 `scene_dialogues.difficulty` 的计划推进,题卡 data 下发动态 `stageGoal` 与 `totalQuestions`。
- `server/skills/_helpers/gradeFsm.ts`、`server/skills/grade.ts` — 批改参考答案推导和阶段完成判断共用同一题量计划,A1 可在阶段 2 第 1 题后进入阶段 3,C1 阶段 2 需 3 题才达标。
- `server/services/difficultyAdaptation.ts` — 自动升降难度的“完整场景”判断改为按场景自身难度对应题量统计,避免用户画像调级后用新等级重新解释旧场景。
- `shared/widget.ts`、`src/components/widgets/ExerciseCard.tsx` — `exercise-card.data.totalQuestions` 进入共享 schema 和组件数据类型;UI 仍沿用现有阶段/题内进度展示。
- `server/__tests__/skill-practice.test.ts`、`server/__tests__/skill-grade.test.ts`、`server/__tests__/learning-services.test.ts` — 增加 A1/C1 动态题量、阶段完成和自动调级完整性覆盖。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/styling.md` — 同步动态题量协议、状态机和题卡展示说明。

## 手工测试

### 后端与前端聚焦测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts server/__tests__/skill-grade.test.ts server/__tests__/learning-services.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/learning-services.test.ts
PASS server/__tests__/skill-grade.test.ts
PASS server/__tests__/skill-practice.test.ts
Test Suites: 3 passed, 3 total
Tests:       48 passed, 48 total
```

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

观察输出:

```text
Test Files  1 passed (1)
Tests       35 passed (35)
```

### 全量单测

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       128 passed, 128 total
Test Files  11 passed (11)
Tests       86 passed (86)
```

### Smoke

命令:

```bash
npm run test:smoke:learning
```

观察输出:

```text
[smoke:learn] PASSED 13 / 13
```

### 构建与格式检查

命令:

```bash
npm run build
```

观察输出:

```text
✓ built in 2.02s
(!) Some chunks are larger than 500 kB after minification.
```

命令:

```bash
git diff --check
```

观察输出:

```text
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- B1/B2 场景保持 8 题主线,旧 smoke 完整闭环不受影响。
- A1/A2 场景题卡下发 `totalQuestions=5`,阶段 2/3/4 各 1 题即可推进。
- C1/C2 场景题卡下发 `totalQuestions=10`,阶段 1/2 各需 3 题才推进。
- 自动难度升降判断按场景自身难度对应的题量识别完整场景。

覆盖的负向场景:

- C1 场景阶段 2 只完成 2 题时不会提前进入阶段 3。
- 主线阶段题量不完整的场景不会参与自动难度升降。

诊断记录:

- 现象:`npm run build` 首次失败,提示 `server/services/difficultyAdaptation.ts` 的 `SceneDialogueRow` 缺少 `difficulty` 字段。
- 根因:单测运行时 SQL 返回了字段,但 TypeScript 行类型未声明且 SELECT 未显式包含该列。
- 处置:补充 `difficulty` 类型字段和查询列后重跑 `npm run build`、`learning-services` 单测通过。

总结:

已跑过 6 / 6 步,全部通过;`git diff --check` 仅有 Windows 换行提示,无 whitespace error。

## 遗留 TODO

- [后端] 阶段题量计划目前由代码常量决定,尚未支持后台或实验配置动态调整。
- [前端] 题卡暂未显式展示整场总题数 `totalQuestions`,仅使用阶段内进度,后续可在不增加噪声的前提下补充总进度。
- [测试] learning smoke 仍以 B1 8 题完整闭环为主,A1/C1 动态题量已由后端单测覆盖,尚未加入跨层 smoke。

## 下一阶段建议

1. **自动归档与新会话衔接**(PRD §3.1 / §3.5)— 当前完成复盘后仍停留在同一 active 会话,下一步可明确“完成一轮后归档并新建下一轮”的确定性策略,让历史列表和学习流生命周期更完整。
2. **移动端辅助追问抽屉完善**(PRD §3.2 / §4.1)— 支线功能已具备核心数据闭环,但窄屏交互还需要遮罩、返回/关闭和焦点恢复,提升手机端可用性。
3. **支线解释摘要入复盘**(PRD §3.2)— “加入复盘”目前只写错误标签和掌握度,可继续保存用户确认的解释摘要,让复盘报告解释“为什么这个错因被纳入”。
4. **SSE 恢复体验验收**(PRD §2.8 / §5.1)— 后端已有 `lastSeq` 与历史快照机制,可补跨层 smoke 或前端恢复状态提示,验证断线后 widget 与状态不丢。
