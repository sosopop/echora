> 日期: 2026-05-17
> 序号: 014
> 任务: 输入发送后保持焦点

## 任务背景

用户反馈当前输入框内容发送后会失去焦点,连续练习时每次都要重新点击输入框,影响作答流畅度。

## 执行摘要

- `src/views/Chat/ChatInput.tsx` — 为 textarea 增加 ref 和提交后恢复焦点标记;发送后清空输入,若正在 streaming 则等流式回复结束后再自动 focus 回输入框。
- `src/__tests__/views/ChatInput.test.tsx` — 增加回归测试,覆盖点击发送后 streaming 结束时输入框恢复焦点且内容已清空。
- `doc/knowledge/styling.md` — 记录 Chat 输入焦点恢复的交互约定与测试入口。

## 手工测试

### 前端聚焦测试

命令:

```bash
npx vitest run src/__tests__/views/ChatInput.test.tsx
```

观察输出:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
```

负样本覆盖:测试中模拟发送后 `streamingMessageId` 非空导致 textarea disabled,随后将 streaming 清空,验证焦点恢复到 textarea 且不会停留在发送按钮上。

### 前端全量测试

命令:

```bash
npm run test:web
```

观察输出:

```text
Test Files  9 passed (9)
Tests       47 passed (47)
```

说明:测试中仍有既有 profile 500 诊断日志和 React Router future flag warning,不影响断言结果。

### 构建验证

命令:

```bash
npm run build
```

观察输出:

```text
tsc -p tsconfig.server.json && vite build
✓ built in 1.75s
```

### 空白检查

命令:

```bash
git diff --check
```

观察输出:

```text
无空白错误;仅提示 Windows 工作区 LF 将被 Git 触碰时替换为 CRLF。
```

### 总结

已跑过 4 / 4 步,全部通过。本次未包含 curl 步骤,无需配套 `014-test.py`。

## 遗留 TODO

- [前端] 尚未做浏览器级手工截图/录屏验证,后续 UI 回归可把连续 Enter 作答纳入 Playwright 场景。

## 下一阶段建议

1. **真实化复盘报告**(PRD §2.2 / §4.7)— 四阶段练习完成后需要 `review` 与 `progress-summary` 承接,让用户看到本轮总结。
2. **错误标签与掌握度写入**(PRD §2.6 / §2.7)— 将批改 tags 写入结构化记录,为复盘/重练提供依据。
3. **降难替换题**(PRD §2.6)— 对 `needs_review` 后的薄弱点生成更简单的同知识点题,减少卡题感。
