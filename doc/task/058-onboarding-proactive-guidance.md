> 日期: 2026-05-19
> 序号: 058
> 任务: 让 onboarding 主动引导用户走完整个工作流

## 任务背景

用户在 `/onboarding` 完成昵称采集后，模型会停在“记下了”一类回复并直接结束流，用户不知道下一步要做什么。这个任务把 onboarding 改成服务端兜底引导，保证它在补齐画像后能继续推进到场景推荐，并补上调试日志与测试覆盖。

## 执行摘要

- `server/skills/onboarding.ts`：补了确定性兜底逻辑。只要 `name` 或 `level` 还缺，就追加下一步提示；当 `name + level` 已齐时，不再停在收集完成提示，而是直接 `state-transition('scene_selecting', 'scene-select')` 并串接 `scene-select` 的推荐流。
- `server/__tests__/skill-onboarding.test.ts`：补了“模型不调工具也要继续引导”的单测，并把完成态断言改成“完成后继续进场景推荐”。
- `tests/smoke/run-smoke-onboarding.ts`：把 onboarding 端到端烟雾测试补齐到 11 个场景，修正了 `AI 不调工具` 与非法 CEFR 负例，确保不会因为状态放错而误判。
- `server/utils/debugLog.ts`、`server/createApp.ts`、`server/index.ts`：整理了调试日志入口，测试环境默认开启、生产默认关闭，默认路径为 `D:\code\echora\logs\server-debug.log` 对应的相对配置 `./logs/server-debug.log`。
- `doc/knowledge/api-contract.md`、`doc/knowledge/architecture.md`、`doc/knowledge/skills.md`：同步记录 onboarding 的主动推进行为和 debug log 入口。

## 手工测试

### 命令

```powershell
npm run test:smoke:onboarding
```

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-onboarding.test.ts server/__tests__/skill-sceneSelect.test.ts server/__tests__/debug-log.test.ts --runInBand
```

```powershell
npm run test:server
```

### 观察结果

```text
[smoke:onb] PASSED 11 / 11
PASS server/__tests__/skill-onboarding.test.ts
PASS server/__tests__/skill-sceneSelect.test.ts
PASS server/__tests__/debug-log.test.ts
PASS server/__tests__/chat-route.test.ts
...
Test Suites: 17 passed, 17 total
Tests: 151 passed, 151 total
```

### 负例

```text
首次复跑时 smoke:onboarding 的 Scenario D 失败，
原因是测试会话状态放到了 scene_selecting，导致非法 CEFR 的 onboarding 工具校验路径被绕开。
已修正为 onboarding 状态后重新通过。
```

## 遗留 TODO

- [后端] 继续观察真实模型在 `/onboarding` 中是否还会出现“只给昵称不问等级”的停顿，如果有，再把 prompt 收紧一层。
- [测试] 后续若新增 onboarding 字段，需要同步补齐主动引导和负例场景。
- [文档] debug log 只记录服务端可观测信息，后续若要给 AI 诊断更多上下文，再评估是否补充会话摘要字段。

## 下一阶段建议

1. **收紧 onboarding 首轮提示**(PRD §2.4 / §2.5) - 让首次进入时更明确地追问 `name` 和 `level`，减少模型自由发挥空间。
2. **补一版日志查看说明**(PRD §4.4 / 运维可观测性) - 把 `logs/server-debug.log` 的查看方式写进开发文档，方便排障时直接定位。
3. **把主动引导模式推广到其他工作流**(PRD §2.6 / §2.7) - 对 `scene-select`、`practice`、`review` 也补上“不能沉默”的服务端兜底。
