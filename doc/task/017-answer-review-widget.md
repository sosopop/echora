> 日期: 2026-05-17
> 序号: 017
> 任务: 复盘单题回看 answer-review

## 任务背景

016 接通了从复盘建议进入重练,但复盘仍只有总览,用户看不到每道题的具体表现。按 PRD §4.7 的 `answer-review` 要求,本次补齐单题回看卡片,并解决同一条复盘消息需要同时展示多个 widget 的历史限制。

## 执行摘要

- `server/skills/review.ts` — 在 `progress-summary` 后继续输出 `answer-review`,从 `exercise_attempts + grading_results` 生成逐题短题干、题型、分数、状态和错误标签。
- `server/services/message.ts` — `messages.widget_snapshot` 兼容单 widget object 与多 widget array,按 widget id upsert,避免同一条 assistant 消息中后一个 widget 覆盖前一个。
- `src/stores/chat.ts` / `src/views/Chat/MessageList.tsx` — 流式与历史消息均支持同一条消息多个 widget snapshot,按顺序渲染多个 `WidgetSlot`。
- `src/components/widgets/AnswerReview.tsx` / `WidgetRenderer.tsx` / `widgets.module.css` — 新增正式 `answer-review` 组件,展示逐题列表与平均分摘要。
- `server/__tests__/skill-review.test.ts` / `src/__tests__/components/widgets/widgets.test.tsx` / `src/__tests__/views/MessageList.test.tsx` — 覆盖 review 输出 answer-review、组件渲染和多 widget 消息渲染。
- `doc/knowledge/{skills,api-contract,styling}.md` — 记录 `answer-review`、多 widget snapshot 兼容协议和测试入口。

## 手工测试

### 后端目标测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-review.test.ts
```

输出:

```text
PASS server/__tests__/skill-review.test.ts
Tests: 2 passed, 2 total
```

覆盖的负样本:

```text
无批改记录 → 友好提示且不显示空 widget
```

### 前端目标测试

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/MessageList.test.tsx
```

输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (20 tests)
✓ src/__tests__/views/MessageList.test.tsx (3 tests)
Test Files  2 passed (2)
Tests       23 passed (23)
```

覆盖的负样本:

```text
answer-review loading 状态不显示空回看卡
同一条消息的多 widget snapshot 同时渲染 progress-summary 与 answer-review
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
Tests       55 passed (55)
```

备注:

```text
测试期间出现既有的 apiClient mock 失败日志与 React Router future warning,不影响结果。
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

### 构建

命令:

```bash
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 72 modules transformed.
✓ built in 1.61s
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

已跑过 6 / 6 组验证,全部通过。负样本覆盖无复盘数据、answer-review loading 不占位、多 widget snapshot 兼容和既有学习闭环错误路径。

## 遗留 TODO

- [前端] `answer-review` 目前是列表速览,尚未实现展开单题详情、上一题/下一题切换、仅看错题筛选。
- [后端] `answer-review` item schema 暂未携带用户答案、参考答案和解释;展开详情需要扩展共享 widget schema。
- [产品] `progress-summary` 中“查看每道题详情”按钮尚未接入滚动/聚焦 answer-review 的交互。

## 下一阶段建议

1. **会话锁定**(PRD §3.1)— 接入 `lock_policy` 和 `conversation-lock`,练习/批改中隐藏历史答案与批改详情,复盘后恢复。
2. **单题详情展开**(PRD §4.7)— 扩展 `answer-review` schema,展示用户答案、参考表达和批改解释,支持仅看错题。
3. **自动降难替换题**(PRD §2.6)— 在第 2 次失败时自动生成同 tag 降难替换题,不必等用户复盘后主动重练。
4. **辅助追问支线**(PRD §3.2)— 基于 `follow-up-source` 为某次批改创建支线讲解,不打断主练习。
