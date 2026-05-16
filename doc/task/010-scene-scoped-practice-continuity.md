> 日期: 2026-05-17
> 序号: 010
> 任务: 修复换场景后的练习连续性

## 任务背景

用户反馈完成一个场景后再选择新场景,新场景没有自然开始练习,而是直接提示“本场景阶段 1-2 已完成”。排查发现练习通过数按整个 conversation 统计,没有按当前场景隔离。

## 执行摘要

- `server/services/exerciseAttempt.ts` — `findLatestAttempt` 与 `countStagePassed` 增加可选 `sceneId` 过滤,保留旧调用兼容。
- `server/skills/_helpers/practiceFsm.ts` / `server/skills/practice.ts` — `decideNextQuestion` 按当前活跃 `scene_dialogue.sceneId` 统计进度,换新场景后从阶段 1 第 1 题开始。
- `server/skills/grade.ts` — 阶段完成判断只统计当前 attempt 的 `sceneId`,旧场景通过记录不再让新场景提前完成。
- `server/routes/chat.ts` — 文本控制指令确定性路由:`practicing` 中 `next/go/出题` 走 `next-question`;`awaiting_next` 中 `START/开始练习/next` 走 `request-new-scenes`;答案绑定只查当前活跃场景 attempt。
- `server/__tests__/skill-practice.test.ts` / `server/__tests__/skill-grade.test.ts` / `server/__tests__/chat-route.test.ts` — 增加新场景不继承旧进度、当前场景计数、`START` 继续练习、答案不绑旧题等回归测试。
- `doc/knowledge/api-contract.md` / `doc/knowledge/skills.md` — 同步 scene-aware 进度与文本控制指令行为。

## 手工测试

### 聚焦回归

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts server/__tests__/skill-grade.test.ts server/__tests__/chat-route.test.ts server/__tests__/learning-services.test.ts --runInBand
```

实测输出:

```text
Test Suites: 4 passed, 4 total
Tests:       32 passed, 32 total
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
Tests:       65 passed, 65 total
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

观察:Vitest 仍会输出既有 profile 500 负样本日志与 React Router future flag warning,不影响通过结论。

命令:

```bash
npm run build
```

实测输出:

```text
✓ 70 modules transformed.
✓ built in 2.32s
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

已跑过 5 / 5 步,全部通过;负样本覆盖非法请求、状态不允许与 Provider 异常。

## 遗留 TODO

- [后端] `practice` 在当前场景存在 pending attempt 时仍可能新建同题 attempt;后续应优先复用当前未答题。
- [产品] 完成阶段 1-2 后仍需要更自然的“下一场景/复盘/继续高级阶段”选择面板。
- [前端] 建议补真实浏览器 E2E 截图,验证完成旧场景后选择新场景会立即出现阶段 1 第 1 题。

## 下一阶段建议

1. **当前题复用**(PRD §2.6)— practice 前查询当前场景最新 pending attempt,避免重复点击导致重复题。
2. **完成后行动面板**(PRD §2.1 / §2.6)— 完成阶段 1-2 后展示“换新场景 / 复盘 / 等待高级阶段”结构化选择,减少用户猜下一步。
3. **降难补救**(PRD §2.6)— `needs_review` 后生成同知识点降难替换题,让错题闭环更连续。
4. **场景级复盘统计**(PRD §2.7)— 将 sceneId 贯穿错误标签与掌握度记录,支持按场景回看表现。
