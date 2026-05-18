> 日期: 2026-05-18
> 序号: 051
> 任务: 取消信号全链路传播

## 任务背景

`doc/prd-gap-audit.md` 仍保留“生成取消信号的全链路传播”。PRD §3.5 要求用户点击停止后,路由、长运行 skill 与 provider 调用都应及时中断,而不是把取消误报成业务失败或继续消耗 token。

## 执行摘要

- `server/ai/types.ts` — `AIProvider.route()` 增加可选 `AbortSignal` 形参,保留 `chat({ signal })` 约束。
- `server/ai/router.ts` — `decide()` 支持 `signal`,在调用 provider 前后检查取消状态,请求已取消时直接抛 `AbortError`。
- `server/ai/providers/{anthropic,openai,stub}.ts` — `route()` 传递 `AbortSignal`;`stub` route/chat 在取消后直接中止。
- `server/routes/chat.ts` — `/api/chat/send` 绑定请求级 `AbortController`,路由阶段被中断时直接结束;`/stream` 之外的发送链路也会把取消传入 AI Router。
- `server/skills/{onboarding,sceneSelect,grade,generalChat}.ts` + `server/skills/_helpers/{sceneSelectFsm,gradeFsm}.ts` — 取消后不再把 abort 误报成业务失败,长运行 helper 在 `signal.aborted` 时直接抛 `AbortError`。
- `server/__tests__/ai-router.test.ts`、`server/__tests__/chat-route.test.ts`、`server/__tests__/skill-{onboarding,sceneSelect,grade,generalChat}.test.ts` — 补 abort / signal 传递与取消路径验证。
- `doc/knowledge/{skills,api-contract,styling}.md`、`doc/prd-gap-audit.md` — 同步取消链路事实,并从剩余缺口中移除这项。

## 手工测试

### 后端单测

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/ai-router.test.ts server/__tests__/skill-onboarding.test.ts server/__tests__/skill-sceneSelect.test.ts server/__tests__/skill-grade.test.ts server/__tests__/skill-generalChat.test.ts server/__tests__/chat-route.test.ts -t "abort|停止|signal|正常路径|SSE|streams" --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-onboarding.test.ts
PASS server/__tests__/ai-router.test.ts
```

### 烟雾测试

命令:

```powershell
npm run test:smoke
```

观察输出:

```text
[smoke] PASSED 6/6
```

### 构建

命令:

```powershell
npm run build
```

观察输出:

```text
✓ built in 2.20s
(!) Some chunks are larger than 500 kB after minification.
```

### 负样本

- `server/__tests__/ai-router.test.ts` 覆盖 signal 已取消时不再调用 `provider.route()`。
- `server/__tests__/chat-route.test.ts` 覆盖 SSE query token 已被拒绝,防止旧式取消/流式路径继续走过时协议。

### 总结

已跑过 3 / 3 组验证,全部通过。

## 遗留 TODO

- [后端] 新增长运行 skill 时仍需持续把 `ctx.signal` 传给 provider/helper,避免回流到旧写法。
- [测试] 目前覆盖到 route / helper / smoke 主路径,尚未做真实终止时序的端到端压力测试。
- [文档] `doc/knowledge/skills.md` 中的取消信号说明后续可继续按新 skill 补充具体路径。

## 下一阶段建议

1. **归档派生上下文增强**(PRD §3.1 / §5.2) — 给“基于此再练”的新会话首屏补旧复盘摘要,让上下文继承更可解释。
2. **进程间共享流**(PRD §2.8 / §3.4 / §5.1) — 若要面向多副本部署,把 `streamBus` 升级到 Redis Streams 或等价共享流。
3. **Widget 样式目录拆分**(工程收尾项) — 若 widget 继续增长,拆 `src/styles/widgets/` 提高样式可维护性。
