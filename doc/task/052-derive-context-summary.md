> 日期: 2026-05-18
> 序号: 052
> 任务: 归档派生上下文增强

## 任务背景

`doc/prd-gap-audit.md` 中的归档派生缺口要求,不仅要让 archived 会话能派生为新学习流,还要让用户一眼看懂这轮“再练”继承了什么历史目标。本次把旧复盘摘要显式带入新会话首屏。

## 执行摘要

- `server/services/deriveConversationContext.ts` — 新增派生上下文摘要提取服务,从最近 `progress-summary` widget 中拼出可读文本。
- `server/routes/chat.ts` — `/api/chat/conversations/:id/derive` 返回 `derivedContextText`,并把这段摘要写成新会话首条 `system` 消息。
- `shared/api.ts` — `ConversationDeriveResp` 增加 `derivedContextText`。
- `src/stores/chat.ts` — 派生归档会话后,在新会话首屏插入来自后端的上下文摘要 system 消息。
- `server/__tests__/chat-route.test.ts`、`src/__tests__/stores/chat.test.ts` — 覆盖含真实 `progress-summary` 的 archived 派生,验证新会话首条消息和返回字段。
- `doc/knowledge/api-contract.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/styling.md`、`doc/prd-gap-audit.md` — 同步派生上下文行为并清掉该缺口。

## 手工测试

### 后端单测

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts -t "派生" --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
Tests: 2 passed, 37 skipped, 39 total
```

### 前端单测

命令:

```powershell
npx vitest run src/__tests__/stores/chat.test.ts -t "归档会话派生"
```

观察输出:

```text
✓ src/__tests__/stores/chat.test.ts (1 test)
```

### 构建

命令:

```powershell
npm run build
```

观察输出:

```text
✓ built in 2.09s
(!) Some chunks are larger than 500 kB after minification.
```

### 负样本

- 非 archived 会话调用派生接口仍返回 `400 VALIDATION_FAILED`。
- 若没有 `progress-summary` 摘要,派生上下文会回退为“上一轮练习上下文”而不是空白。

### 总结

已跑过 3 / 3 组验证,全部通过。

## 遗留 TODO

- [后端] 归档派生目前只读最近一次复盘摘要,后续若要更强解释力,可把多轮复盘压缩成更短的摘要句。
- [前端] 当前首屏摘要以 system message 呈现,后续若需要更醒目的视觉层级,可再拆独立 widget。
- [测试] 暂未做“多轮复盘摘要合并”的专门用例。

## 下一阶段建议

1. **进程间共享流**(PRD §2.8 / §3.4 / §5.1) — 多副本部署下仍依赖内存 `streamBus` + DB 轮询,这是剩余最核心的工程缺口。
2. **Widget 样式目录拆分**(工程收尾项) — 如果 widget 继续扩展,把样式拆到 `src/styles/widgets/` 可以降低公共样式耦合。
