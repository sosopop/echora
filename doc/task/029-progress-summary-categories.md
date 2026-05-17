> 日期: 2026-05-17
> 序号: 029
> 任务: 复盘摘要三档化

## 任务背景

批改卡已在 021 中改为"完全正确 / 还不错 / 错误"三档,但复盘摘要仍把平均分作为用户可见主指标。为保持体验一致,本次将 `progress-summary` 改为展示三档分布,平均分仅保留为兼容和内部统计字段。

## 执行摘要

- `server/skills/review.ts` — 复盘文本改为输出三档分布;`progress-summary.data` 增加 `categoryCounts`;强项文案移除分数后缀。
- `shared/widget.ts` — `ProgressSummaryWidgetSchema` 增加可选 `categoryCounts`。
- `src/components/widgets/ProgressSummary.tsx` — 用户可见统计从平均分改为题数、完全正确、还不错、错误、薄弱点。
- `server/__tests__/skill-review.test.ts` — 覆盖 `categoryCounts` 和复盘文本不再出现"平均"。
- `src/__tests__/components/widgets/widgets.test.tsx` — 覆盖前端不显示 `averageScore`,而显示三档标签。
- `tests/smoke/run-smoke-learning.ts` — 学习闭环 smoke 增加三档分布断言,平均分只作为内部兼容字段验证。
- `doc/knowledge/skills.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/styling.md` — 同步复盘摘要三档化行为。

## 手工测试

### 后端单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-review.test.ts
```

输出:

```text
PASS server/__tests__/skill-review.test.ts
Tests: 2 passed, 2 total
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

负样本:前端测试断言 `averageScore=86` 不出现在 `progress-summary` 可见内容中,确认分数没有继续作为主展示项。

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] ✓ A 完整闭环(scene → 阶段 1-4 各 2 题 → awaiting_next → review → retry) (1457ms)
[smoke:learn] PASSED 13 / 13
```

### 全量单元

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 105 passed, 105 total
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
✓ built in 2.40s
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

结论:仅有 Windows 行尾提示,无 whitespace error。已跑过 6 / 6 步,全部通过。

## 遗留 TODO

- [前端] `answer-review` 仍展示逐题分数,后续可同步改为三档 badge 或折叠详情中的内部指标。
- [数据] 历史批改若没有 `category`,当前按 `is_correct/score` 兜底推导三档;真实历史迁移未单独处理。
- [产品] 掌握度条仍是 0-100 分值形式,是否也转成等级文案需后续确认。

## 下一阶段建议

1. **AnswerReview 三档化**(PRD §4.7)— 将逐题回看从分数 badge 改为三档状态,和批改/复盘保持一致。
2. **动态题量与难度**(PRD §2.6)— 当前每阶段固定 2 题,还未按表现动态调整 5-10 题与难度升降。
3. **辅助追问右侧支线**(PRD §3.2)— 接入 `branch_threads` 和右侧面板,让 explain 不污染主学习流。
4. **归档引用为新会话**(PRD §3.1 / §3.5)— archived 已只读,下一步可支持基于旧场景新开练习。
