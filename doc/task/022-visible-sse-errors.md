> 日期: 2026-05-17
> 序号: 022
> 任务: SSE 错误可见化

## 任务背景

用户反馈答题后界面只出现自己的消息,没有 AI 回复。排查后发现服务端 Skill 通过 SSE 返回 `error` 事件时,前端只写入全局 error state,没有写回当前 assistant 消息,流结束后空 assistant 气泡被过滤,造成"没有回复"的假象。

## 执行摘要

- `src/stores/chat.ts` — 收到 SSE `error` 时把 `出错了:<code>: <message>` 写入当前 assistant 消息;连接失败且没有任何正文时也写入错误 fallback。dev 模式下保留 `details` JSON 调试信息。
- `src/__tests__/stores/chat.test.ts` — 新增 Skill error 可见化测试,覆盖 `GRADE_FAILED` / provider tool_choice 类错误不会再留下空白消息。
- `doc/knowledge/api-contract.md` — 记录 SSE `error` 事件的前端展示约定。
- `doc/knowledge/styling.md` — 记录 Chat 错误气泡防空白规则和测试入口。

## 手工测试

### 前端 Store 单测

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts
```

输出:

```text
✓ src/__tests__/stores/chat.test.ts (5 tests)
Tests: 5 passed
```

覆盖:正常 done 后保留文本、POST 返回前思考占位、action 文案、submit-answer 用户消息、SSE `error` 负样本写入 assistant 气泡。

### 全量单元

命令:

```bash
npm run test:unit
```

输出:

```text
Test Suites: 16 passed, 16 total
Tests: 96 passed, 96 total
Test Files 9 passed (9)
Tests 66 passed (66)
```

### 学习闭环 Smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] PASSED 12 / 12
```

覆盖:保留 provider chat 抛错、重复提交锁定、非法动作等负路径;错误不再破坏学习闭环。

### 构建

命令:

```bash
npm run build
```

输出:

```text
✓ built in 2.36s
```

### 空白检查

命令:

```bash
git diff --check
```

输出:

```text
Exit code 0; only CRLF normalization warnings, no whitespace errors.
```

### 总结

已跑过 5 / 5 步,全部通过。负样本为 SSE `GRADE_FAILED` 错误事件和 smoke 中 provider 错误 / locked attempt 等路径。

## 遗留 TODO

- [前端] 当前错误文案复用 assistant 气泡普通文本样式;后续可增加轻量错误态样式,但避免遮挡真实错误细节。
- [后端] 对 `ATTEMPT_LOCKED` 这类用户可恢复错误,可进一步改为 `text-chunk + done` 的友好提示,减少"错误"语气。
- [测试] 可补浏览器层断言,模拟 EventSource error 后检查聊天列表实际 DOM 文案。

## 下一阶段建议

1. **错题恢复引导**(PRD §2.6)— 对 locked / needs_review 的再次作答,直接提示"这题已进入复盘,请继续下一题",降低用户困惑。
2. **复盘非分数化**(PRD §2.2 / §4.7)— 批改卡已三档化,复盘仍有平均分,建议继续统一为三档分布和薄弱点趋势。
3. **真实 Provider 错误面板**(PRD §5.2)— 将 provider 原始错误按 code 分类显示,帮助开发模式快速定位 DeepSeek / OpenAI / Anthropic 配置问题。
4. **自由对话阶段增强**(PRD §2.6)— 在自动下一题稳定后,可推进阶段 3/4 的连续多轮角色扮演。
