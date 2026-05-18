> 日期: 2026-05-19
> 序号: 059
> 任务: 调试日志改为自然语言摘要并去掉逐 token 输出

## 任务背景

`logs/server-debug.log` 原先以 JSONL 写入，而且会记录 AI 通讯的逐 stream event 内容，实际排障时太冗余。用户要求日志改成普通自然语言文本，并且 AI 流式输出只记录最终结果。

## 执行摘要

- `server/utils/debugLog.ts` — `createDebugLogger` 改为写自然语言段落，继续保留脱敏和截断；针对 HTTP、聊天、AI 输入输出、工作流状态、Skill 运行结果输出可读摘要。
- `server/ai/debugChat.ts` — 移除 `ai_chat_event` 逐事件日志，只累计最终文本、工具调用、text delta 数和总事件数，并在 AI chat 结束时写一条最终摘要。
- `server/routes/chat.ts` — 移除逐 `SkillEvent` 日志，改为错误事件即时记录、成功结束时记录 Skill 摘要；去掉和 provider route 重复的 `ai_route_input/output` 日志。
- `server/__tests__/debug-log.test.ts` — 测试改为读取自然语言文本，断言日志不再是 JSONL、不包含 `ai_chat_event` / `skill_event` 逐流事件，并覆盖脱敏、AI 最终输出和 Skill 最终文本。
- `doc/knowledge/architecture.md` — 更新 debug log 策略，明确日志面向 AI 排障、写自然语言摘要、不记录逐 token/逐 stream event。

## 手工测试

### 命令

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/debug-log.test.ts --runInBand
```

### 观察输出

```text
PASS server/__tests__/debug-log.test.ts
Tests: 2 passed, 2 total
```

```powershell
npx tsc -p tsconfig.server.json --noEmit
```

### 观察输出

```text
命令退出码 0,无 TypeScript 编译错误
```

### 负例

```text
测试断言日志首行不能 JSON.parse,并且日志正文不包含 ai_chat_event / skill_event。
这覆盖了“不要 JSONL”和“不要逐 token/逐 stream event 记录”的负向要求。
```

## 遗留 TODO

- [后端] 如果后续需要更短的排障包,可以增加按 traceId 导出最近 N 条自然语言日志的接口或脚本。
- [测试] 后续若新增日志事件类型,需要补 `formatDebugLogEntry` 的自然语言分支,避免回退成低可读性的原始字段堆叠。

## 下一阶段建议

1. **日志查看说明**(PRD §4.4) — 增加开发者文档小节,说明 `DEBUG_LOG_ENABLED`、`DEBUG_LOG_PATH` 和如何把日志片段交给 AI 分析。
2. **onboarding 拒答策略**(PRD §2.4 / §2.5) — 截图显示用户拒绝昵称后 Echo 仍反复追问昵称,可进一步让 workflow 在用户明确拒绝时先用临时称呼并继续采集英语水平。
3. **排障上下文压缩**(PRD §4.4) — 对长 prompt 增加更强的字段级摘要,进一步减少日志体积。
