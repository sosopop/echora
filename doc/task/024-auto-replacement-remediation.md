> 日期: 2026-05-17
> 序号: 024
> 任务: 二次错误自动降难替换题

## 任务背景

PRD §2.6 要求用户同题第 2 次仍未通过时,系统应展示讲解并生成同知识点降难替换题,避免被单题永久卡住。此前系统只会把原题标记 `needs_review`,需要用户后续主动重练。

## 执行摘要

- `server/services/exerciseAttempt.ts` — 新增 `countStageHandled`,把正确题与 `needs_review` 都视为已处理,用于主线继续推进。
- `server/skills/_helpers/practiceFsm.ts` — 主线下一题判断改用已处理数量,避免二次错误题卡住阶段进度。
- `server/services/attemptPrompt.ts` — 结构化 prompt 的 `kind` 扩展为 `retry | replacement`,并支持 `sourceAttemptId`。
- `server/skills/grade.ts` — 主线题第 2 次错误后自动调用 `retry(mode=replacement)`,替换题通过后回到 `practice` 主线。
- `server/skills/retry.ts` — 增加 replacement 模式,生成单道替换题并排除在 3 题专项重练计数之外。
- `shared/widget.ts`、`src/components/widgets/ExerciseCard.tsx` — `exercise-card.data.remediationKind` 支持 `replacement`,前端显示为"替换题"。
- `server/__tests__/*.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx`、`tests/smoke/run-smoke-learning.ts` — 补齐替换题、needs_review 推进和 smoke 验证。
- `doc/knowledge/skills.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/api-contract.md`、`doc/knowledge/styling.md` — 同步记录自动替换题行为、公共字段和展示规则。

## 手工测试

### 后端单元

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-grade.test.ts server/__tests__/skill-practice.test.ts server/__tests__/skill-retry.test.ts server/__tests__/learning-services.test.ts
```

输出:

```text
PASS server/__tests__/skill-practice.test.ts
PASS server/__tests__/skill-grade.test.ts
PASS server/__tests__/learning-services.test.ts
PASS server/__tests__/skill-retry.test.ts
Test Suites: 4 passed, 4 total
Tests: 44 passed, 44 total
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

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] ✓ E 同题答错 2 次 → markNeedsReview + 降难替换题 (414ms)
[smoke:learn] ✓ G 重复提交同 attempt(已标 needs_review 后) → ATTEMPT_LOCKED (498ms)
[smoke:learn] PASSED 12 / 12
```

负样本:场景 G 对已 `needs_review` 的原题第 3 次提交,观察到 `ATTEMPT_LOCKED`,证明原题锁定仍生效,不会绕过二次失败限制。

### 全量单元

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 100 passed, 100 total
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
✓ built in 1.81s
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

- [后端] 替换题目前按 tag 使用内置模板降难,还未根据原题句子动态生成更贴近原语境的替换题。
- [前端] 替换题通过后仅用普通文本提示回主线,未来可在题卡或进度条上更明确展示"已补救"状态。
- [数据] `needs_review` 与替换题之间已通过 `sourceAttemptId` 建立 prompt 级关联,但尚未落为可查询的专门字段。

## 下一阶段建议

1. **辅助追问与分支线程**(PRD §2.4 / §2.6)— 当前 explain 已能基于最近题解释,但完整右侧 branch thread 与"不污染主学习流"的独立交互还未实现。
2. **长期记忆与复习计划增强**(PRD §2.2 / §4.7)— `mastery_records` 已写入,但 `next_review_at` 还没有驱动主动复习入口或场景推荐。
3. **自由聊天真实化**(PRD §2.1 / §4.2)— `general-chat` 仍是规则文本,可接真实 LLM 同时保留低置信度确认和锁定态保护。
4. **练习体验进度可视化**(PRD §2.6)— 四阶段、替换题、重练都已跑通,但 UI 还缺当前阶段进度、剩余题数和补救状态的统一展示。
