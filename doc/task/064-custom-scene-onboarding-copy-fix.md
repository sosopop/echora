> 日期: 2026-05-19
> 序号: 064
> 任务: 修复日志暴露的自定义场景与 onboarding 文案问题

## 任务背景

根据 `logs/server-debug.log` 复盘聊天流程后,发现 `scene_selecting` 状态下用户直接输入自定义场景会被重新推荐卡片覆盖,onboarding 中“某年级的水平”也可能被误记为真实年级,且完成文案会同时引导自由话题和场景卡片。

## 执行摘要

- `server/routes/chat.ts` — 在 `scene_selecting` 中将普通文本确定性路由为 `scene-select` 的 `customSceneText`,避免绕 AI Router 后重新生成推荐卡片。
- `server/skills/sceneSelect.ts` — 新增自定义场景分支,将自由文本直接转成场景候选并进入 dialogue/practice 生成,不再渲染 `scene-cards`。
- `server/skills/onboarding.ts`、`server/skills/_helpers/onboardingFsm.ts` — 补充“年级水平”清洗规则,完成 onboarding 时使用确定性确认文案,避免模型输出继续追问话题。
- `server/__tests__/skill-sceneSelect.test.ts`、`server/__tests__/skill-onboarding.test.ts`、`server/__tests__/chat-route.test.ts`、`tests/smoke/run-smoke-onboarding.ts`、`tests/smoke/run-smoke-learning.ts` — 增加/调整自定义场景、年级清洗、错误路径和 smoke 断言。
- `doc/prd.md`、`doc/knowledge/skills.md`、`doc/knowledge/api-contract.md` — 同步自定义场景自由输入、onboarding 字段清洗和文案契约。

## 手工测试

### 定向后端回归

命令:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand server/__tests__/skill-sceneSelect.test.ts server/__tests__/skill-onboarding.test.ts server/__tests__/chat-route.test.ts
```

输出:

```text
Test Suites: 3 passed, 3 total
Tests:       65 passed, 65 total
```

结论:自定义场景文本直接进入 dialogue/practice,onboarding 年级清洗和聊天路由均通过。

### Learning Smoke 负例

命令:

```powershell
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] ✓ I provider chat 抛错 → SkillEvent error 直传客户端 (163ms)
[smoke:learn] PASSED 13 / 13
```

结论:显式 `request-new-scenes` 仍覆盖重新推荐失败路径;普通文本不再误触发重新推荐。

### 全量测试

命令:

```powershell
npm test
```

输出:

```text
Test Suites: 17 passed, 17 total
Tests:       158 passed, 158 total
Test Files  13 passed (13)
Tests       96 passed (96)
[smoke] PASSED 6/6
[smoke:onb] PASSED 13 / 13
[smoke:learn] PASSED 13 / 13
```

结论:后端、前端和 smoke 全量通过。测试中仍有既有 `JWT_SECRET` 开发默认值告警、React Router future flag 提醒和 profile store 失败路径日志,均非本次新增阻断。

### 构建验证

命令:

```powershell
npm run build
```

输出:

```text
tsc -p tsconfig.server.json && vite build
✓ 81 modules transformed.
✓ built in 2.04s
```

结论:服务端类型检查和前端生产构建通过。Vite 仍提示单个 chunk 超过 500 kB,属于既有体积提醒。

## 遗留 TODO

- [后端] 暂未把自定义场景文本做更细的安全/长度策略分层,当前只按技能侧候选标题截断处理。
- [前端] 自定义卡点击后的输入提示已在 063 中覆盖,本次未新增更复杂的输入引导 UI。
- [测试] 未接入真实 AI provider 复测,本次使用 deterministic/stub provider 覆盖工作流语义。

## 下一阶段建议

1. **场景学习闭环**(PRD §5.1)— 为自定义场景补充用户可见的确认/编辑能力,减少输入含糊时直接生成练习的跳跃感。
2. **Onboarding 资料收集**(PRD §5.2)— 增加更多中文口语化水平描述样本,把字段清洗从单测扩展为表驱动回归。
3. **错误与恢复体验**(PRD §8)— 将 provider 失败时的用户文案区分为推荐失败、对话生成失败、批改失败,便于用户理解下一步。
4. **测试与发布门禁**(PRD §9)— 将 smoke 中关键负例抽成可复用 helper,降低后续状态语义调整时的用例维护成本。
