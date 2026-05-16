> 日期: 2026-05-17
> 序号: 009
> 任务: 修复批改 loading 闪 0 分与下一题卡住

## 任务背景

用户反馈提交答案后,批改等待期间先显示 0 分卡片,AI 返回后再跳到真实分数;同时阶段 2 多次练习后点击「下一题」又出现无响应。

## 执行摘要

- `src/components/widgets/GradingResult.tsx` — `grading-result` 只有在 `status='ready'` 且 `score/isCorrect` 都存在时才渲染结果卡,避免 loading 阶段显示 0 分。
- `src/views/Chat/WidgetSlot.tsx` / `src/components/widgets/WidgetRenderer.tsx` — 允许 widget 渲染结果为空,并在 loading 批改卡时不占位显示。
- `server/skills/_helpers/practiceFsm.ts` — 下一题题号改为按当前阶段已通过数量推进,不再用最大 `question_no + 1`,避免旧的未答/错题/重复点击记录把阶段 2 推到第 6/7 题后找不到模板。
- `server/__tests__/skill-practice.test.ts` — 增加“未通过/重复题不把 question_no 推到模板之外”回归测试。
- `src/__tests__/components/widgets/widgets.test.tsx` — 增加批改 loading 不提前渲染 0 分的回归测试。
- `doc/knowledge/skills.md` / `doc/knowledge/styling.md` — 同步练习推进与批改 loading 行为说明。

## 手工测试

### 聚焦回归

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts --runInBand
```

实测输出:

```text
PASS server/__tests__/skill-practice.test.ts
Tests: 6 passed, 6 total
```

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx
```

实测输出:

```text
Test Files 1 passed (1)
Tests      9 passed (9)
```

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

实测输出:

```text
[smoke:learn] PASSED 10 / 10
```

覆盖的负样本:

```text
F grading 态调 scene-select → router state_not_allowed (502)
H /send 同时传 text + action → 400 VALIDATION_FAILED
I provider chat 抛错 → SkillEvent error 直传客户端
```

### 全量单元与构建

命令:

```bash
npm run test:server
```

实测输出:

```text
Test Suites: 12 passed, 12 total
Tests:       61 passed, 61 total
```

命令:

```bash
npm run test:web
```

实测输出:

```text
Test Files 8 passed (8)
Tests      39 passed (39)
```

观察:Vitest 仍会输出既有的 profile 500 负样本日志与 React Router future flag warning,不影响通过结论。

命令:

```bash
npm run build
```

实测输出:

```text
✓ 70 modules transformed.
✓ built in 2.26s
```

命令:

```bash
git diff --check
```

实测输出:

```text
Exit code 0; only CRLF normalization warnings for modified files.
```

### 总结

已跑过 6 / 6 步,全部通过;负样本覆盖非法请求、状态不允许与 Provider 异常三类失败路径。

## 遗留 TODO

- [前端] 仍建议补真实浏览器 E2E,验证批改等待期间视觉上只显示“正在批改”文本、不出现空白跳动。
- [后端] 当前未答题时再次请求 practice 会复用“已通过数量 + 1”的目标题号,但仍会创建新 attempt;后续可改为返回当前 pending attempt 提示。
- [产品] 错题第 2 次失败后的降难替换题仍未落地,当前只标记 `needs_review`。

## 下一阶段建议

1. **当前题复用**(PRD §2.6)— practice 前先查询最新 pending attempt,未提交时不新建题,直接提示用户完成当前题。
2. **降难补救**(PRD §2.6)— `needs_review` 后生成同知识点降难替换题,避免用户被错题卡死。
3. **浏览器 E2E**(PRD §5.1 / §5.2)— 用真实浏览器覆盖“提交答案 → 批改等待 → 结果卡 → 下一题”的可见链路。
4. **复盘数据写入**(PRD §2.7)— 将批改标签写入 `error_tag_events` 与 `mastery_records`,让错题结果服务于后续复盘。
