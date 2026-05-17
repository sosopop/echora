> 日期: 2026-05-17
> 序号: 021
> 任务: 正确答案自动下一题与三档批改

## 任务背景

用户反馈练习中答对后仍需手动点击"下一题",且批改卡展示分数不符合学习体验预期。本次将批改结果改为三档状态,并在 exact / similar 通过后自动串接下一题。

## 执行摘要

- `server/skills/_helpers/gradeFsm.ts` — `grade_answer` 增加 `category=exact/similar/incorrect`,并将 exact/similar 归为通过;score 保留为内部统计字段。
- `server/skills/grade.ts` — 批改通过后自动调用 `practice` 或 `retry` 生成下一张题卡;阶段 4 达标后才进入 `awaiting_next`;错题仍保持原 retry / needs_review 流程。
- `server/services/gradingResult.ts` / `shared/widget.ts` — 批改 corrections 与 widget schema 增加可选 `category`,兼容历史 `score/isCorrect`。
- `src/components/widgets/GradingResult.tsx` / `src/views/Chat/WidgetSlot.tsx` / `src/components/widgets/widgets.module.css` — 批改卡不再展示分数和"下一题"按钮,改为"完全正确 / 还不错 / 错误"三档;loading 防线改为优先校验 `category`。
- `tests/smoke/run-smoke-learning.ts` / `server/__tests__/skill-grade.test.ts` / `src/__tests__/components/widgets/widgets.test.tsx` — 更新自动下一题、重练自动续题、三档批改与负例断言。
- `doc/knowledge/api-contract.md` / `doc/knowledge/skills.md` / `doc/knowledge/state-machine.md` / `doc/knowledge/styling.md` — 同步记录三档批改协议、自动推进状态机与前端展示规则。

## 手工测试

### 后端单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-grade.test.ts
```

输出:

```text
PASS server/__tests__/skill-grade.test.ts
Tests: 14 passed, 14 total
```

覆盖:exact 自动下一题、similar 自动下一题、incorrect 负例保持 retry_count=1、阶段 2 自动进入阶段 3、阶段 4 完成才进入 `awaiting_next`、重练第 1 题通过后自动进入第 2 题。

### 前端组件

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (30 tests)
Tests: 30 passed
```

覆盖:loading 不渲染空批改卡;exact/similar 不显示分数和下一题按钮;incorrect 显示错误标签与改写提示。

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] PASSED 12 / 12
```

覆盖:场景 A 完成阶段 1-4 共 8 题后进入 `awaiting_next`,复盘仍显示 `progress-summary`,重练第 1 题通过后自动出现第 2 题;场景 D/E/G 继续覆盖答错、二次错题和锁定等负路径。

### 全量单元与构建

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 96 passed, 96 total
Test Files 9 passed (9)
Tests 65 passed (65)
```

命令:

```bash
npm run build
```

输出:

```text
✓ built in 1.87s
```

命令:

```bash
git diff --check
```

输出:

```text
Exit code 0; only CRLF normalization warnings, no whitespace errors.
```

### 总结

已跑过 6 / 6 步,全部通过。负样本包含 incorrect 批改、同题二次错误进入 needs_review、重复提交锁定等既有 smoke 场景。

## 遗留 TODO

- [后端] `score` 仍用于复盘平均分与掌握度统计;若产品后续决定完全隐藏或替换为非百分制统计,需要同步改 `progress-summary` 与学习数据算法。
- [前端] 真实浏览器下可继续观察自动下一题滚动位置,确保长题卡展开后仍能稳定滚到底部。
- [测试] 暂未加入真实 provider 的 exact/similar 分类 E2E;当前通过 mock/scripted provider 覆盖协议和状态推进。

## 下一阶段建议

1. **自由对话接龙增强**(PRD §2.6)— 当前阶段 3/4 仍是单题式 chat 作答,可继续推进到连续多轮角色扮演,提升场景沉浸感。
2. **复盘非分数化**(PRD §2.2 / §4.7)— 批改卡已去分数,复盘仍展示平均分;建议改为达标率、三档分布和薄弱点趋势,保持体验一致。
3. **错题二次失败自动换题**(PRD §2.6)— 当前同题错两次进入 needs_review,可补充"降难替换题"即时接管,减少练习断流。
4. **真实 Provider 分类校准**(PRD §5.2)— 为 OpenAI / Anthropic / DeepSeek 兼容路径补充 exact/similar/incorrect 的提示与工具调用兼容测试,减少不同模型行为漂移。
