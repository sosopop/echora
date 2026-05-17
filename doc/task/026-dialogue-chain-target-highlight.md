> 日期: 2026-05-17
> 序号: 026
> 任务: 对话接龙目标句高亮

## 任务背景

阶段 4 已经把用户需要表达的中文句子用 `targetZh` 单独高亮,但阶段 3「对话接龙」的目标意思仍混在题干里。为提升读题速度,本次把阶段 3 也改为独立目标句块。

## 执行摘要

- `server/skills/_helpers/practiceFsm.ts` — `dialogue_chain` 的 display 增加 `targetZh`,并把 `contextZh` 简化为任务说明,避免重复展示目标意思。
- `server/__tests__/skill-practice.test.ts` — 断言阶段 3 题卡下发 `targetZh`。
- `src/__tests__/components/widgets/widgets.test.tsx` — 断言对话接龙题卡显示"请表达「目标句」"块。
- `doc/knowledge/skills.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/styling.md` — 同步阶段 3/4 共享目标句块的协议与样式说明。

## 手工测试

### 后端单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts
```

输出:

```text
PASS server/__tests__/skill-practice.test.ts
Tests: 10 passed, 10 total
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

负样本:同一组 widget 测试保留 `loading 状态不显示阶段问号题卡`,确认新增 `targetZh` 不会让 loading/缺字段题卡提前占位。

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
✓ built in 2.48s
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

- [前端] 题卡仍未展示四阶段整体进度条或剩余题数,用户只能从标题理解当前阶段和题号。
- [后端] 阶段 3 仍是单题式对话接龙,不是连续多轮实时角色扮演。
- [产品] 阶段 3/4 的目标块文案统一为"请表达",后续可根据题型微调为"目标意思"等更贴切标签。

## 下一阶段建议

1. **自由对话角色互换**(PRD §2.6)— 在目标句明确后,继续推进阶段 3/4 的连续多轮角色扮演,提升场景沉浸感。
2. **练习进度可视化**(PRD §2.6 / §4.7)— 为 `exercise-card` 增加当前阶段进度、整场剩余题数和替换题状态。
3. **辅助追问右侧支线**(PRD §3.2)— 将 explain 从主消息流拆到 branch thread,保证追问不污染主学习流。
4. **复盘非分数化**(PRD §2.2 / §4.7)— 用三档分布和薄弱点趋势替代平均分,和批改卡体验保持一致。
