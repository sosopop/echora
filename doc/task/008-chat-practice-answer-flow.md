> 日期: 2026-05-17
> 序号: 008
> 任务: 修复练习答案批改、消息顺序与聊天滚动

## 任务背景

用户反馈阶段 2 直接输入英文答案后只出现普通聊天回复,错误答案没有批改提示;同时发送后聊天列表没有先显示用户内容,widget 展开后滚动也可能不到底。

## 执行摘要

- `server/routes/chat.ts` — `practicing` 态下自由文本会绑定最新可作答 attempt 并走 `grade`,但 `出题` / `go` / `下一题` 等控制指令仍交给 AI Router;`submit-answer` 用户消息落真实答案。
- `server/skills/_helpers/gradeFsm.ts` — 批改 prompt 从 `scene_dialogue` + attempt stage/questionNo 推导参考答案,要求模型优先按参考答案批改。
- `src/stores/chat.ts` / `src/views/Chat/MessageBubble.tsx` — `/send` 返回前先插入临时用户消息与 assistant 思考占位,随后用真实 messageId 和 SSE 结果替换。
- `src/views/Chat/ChatInput.tsx` / `src/components/widgets/GradingResult.tsx` — 阶段 2 chat 输入也优先提交最新题答案;错题卡片提示可在底部改句重试,并保留跳过入口。
- `src/views/Chat/MessageList.tsx` / `src/views/Chat/index.module.css` — 聊天滚动改为滚到 document 底部,并在 widget resize/ready 后补滚动,避免 fixed 输入栏遮挡底部内容。
- `server/__tests__/chat-route.test.ts` / `src/__tests__/views/ChatInput.test.tsx` / `src/__tests__/stores/chat.test.ts` 等 — 覆盖答案兜底、控制指令负样本、消息顺序、思考占位、滚动补偿和错题 UI。
- `doc/knowledge/api-contract.md` / `doc/knowledge/skills.md` / `doc/knowledge/styling.md` — 同步 API、Skill 与 Chat UI 行为说明。

## 手工测试

### 后端 + 前端单元

命令:

```bash
npm run test:server
```

实测输出:

```text
Test Suites: 12 passed, 12 total
Tests:       60 passed, 60 total
```

命令:

```bash
npm run test:web
```

实测输出:

```text
Test Files  8 passed (8)
Tests       38 passed (38)
```

观察:Vitest 仍会输出既有的 profile 500 负样本日志与 React Router future flag warning,不影响通过结论。

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

### 构建与空白检查

命令:

```bash
npm run build
```

实测输出:

```text
✓ 70 modules transformed.
✓ built in 2.31s
```

命令:

```bash
git diff --check
```

实测输出:

```text
Exit code 0; only CRLF normalization warnings for modified files.
```

### 前端 UI 覆盖说明

本次未启动真实浏览器手动点击;可见 UI 行为由 jsdom 组件测试覆盖:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/ChatInput.test.tsx src/__tests__/views/MessageBubble.test.tsx src/__tests__/views/MessageList.test.tsx src/__tests__/components/widgets/widgets.test.tsx
```

实测输出:

```text
Test Files 5 passed (5)
Tests      22 passed (22)
```

观察:覆盖了 chat 模式答案提交、`出题` 控制指令不被误当答案、assistant 空流显示 "Echo 正在思考中..."、widget 展开后滚动到底部、错题提示和跳过按钮。

### 总结

已跑过 6 / 6 步,全部通过;负样本覆盖了非法请求、状态不允许和 Provider 异常三类失败路径。

## 遗留 TODO

- [前端] 真实浏览器端到端点击仍建议接 Playwright/Chrome 自动化,覆盖登录后完整视觉流程与滚动截图。
- [后端] `practice` 当前允许在存在未答 attempt 时继续新建下一题;本次只避免把控制指令误判为答案,后续可收紧为“未答先提示答当前题”。
- [产品] 错题第 2 次仍未通过后的降难替换题尚未实现,当前只标记 `needs_review`。

## 下一阶段建议

1. **未答题保护**(PRD §2.6)— 在 `practice` 出下一题前检测最新 pending attempt,避免用户无意跳过当前题导致阶段内题号膨胀。
2. **降难替换题**(PRD §2.6)— `needs_review` 后生成同知识点更简单题,让错题闭环更像真实教练引导。
3. **掌握度写入**(PRD §2.6 / §2.7)— 将错误标签写入 `error_tag_events` 与 `mastery_records`,支撑后续复盘和自适应难度。
4. **真实 UI E2E**(PRD §5.1 / §5.2)— 增加浏览器自动化覆盖“选择场景 → 答错 → 重试 → 下一题 → 完成”的用户可见链路。
