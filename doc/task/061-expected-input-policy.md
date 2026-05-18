> 日期: 2026-05-19
> 序号: 061
> 任务: 为带预期回答的 workflow step 补通用错误处理 policy

## 任务背景

用户指出,当某一步需要用户明确回答时,系统必须有明确的错误处理机制,不能只靠 prompt 让模型“自己看着办”。这次主要是把 onboarding 的昵称与英语水平采集收口,并抽出一套可复用的 step policy,避免后续工作流状态偏离。

## 执行摘要

- 新增 [`server/skills/_helpers/interactionPolicy.ts`](file:///D:/code/echora/server/skills/_helpers/interactionPolicy.ts),抽象 `ExpectedInputPolicy` / `ExpectedInputRecovery` / `ExpectedInputResolution`。
- `server/skills/onboarding.ts` 改为显式处理三类结果:
  - `name` 拒答 → 写入临时称呼 `小伙伴`,继续推进。
  - `level` 拒答或要求 AI 代定 → 重问,不猜测,不转场。
  - 选填字段 → 可跳过,不阻塞主流程。
- `server/__tests__/skill-onboarding.test.ts` 新增“拒绝英语水平必须重问”的单测。
- `tests/smoke/run-smoke-onboarding.ts` 新增 `C3` 场景,验证拒绝英语水平时不会调用模型兜底猜测。
- 同步更新了 [`doc/knowledge/skills.md`](file:///D:/code/echora/doc/knowledge/skills.md)、[`doc/knowledge/api-contract.md`](file:///D:/code/echora/doc/knowledge/api-contract.md)、[`doc/knowledge/state-machine.md`](file:///D:/code/echora/doc/knowledge/state-machine.md)。

## 手工测试

### 命令

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-onboarding.test.ts --runInBand
npm run test:smoke:onboarding
npm run test:server
```

### 观察输出

```text
PASS server/__tests__/skill-onboarding.test.ts
10 passed, 10 total
```

```text
[smoke:onb] PASSED 13 / 13
```

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-onboarding.test.ts
...
Tests: 154 passed, 154 total
```

### 负例

- `C3` 场景输入“你决定吧,都可以”时,系统没有调用模型猜测 `level`,而是继续追问英语水平。

## 遗留 TODO

- [后端] 将 `ExpectedInputPolicy` 逐步应用到 `scene-select` / `grade` / `retry` / `review` 等带明确预期输入的步骤。
- [后端] 把“可兜底 / 必须重问 / 可跳过 / 必须失败”这四类恢复语义继续固化成更细粒度的 policy 约定。
- [测试] 为更多 skill 补同类拒答/模糊输入的 smoke 场景。

## 下一阶段建议

1. **把 policy 下沉到各 skill 的 step 级定义**(对应 PRD 中每个工作流节点)——让每一步直接声明 `required / fallback / skip / fail`，减少 prompt 中的隐式约定。
2. **为高风险步增加 fail-fast**(OpenAI Agents 里的 guardrails / structured outputs 思路)——例如批改、场景生成、身份信息采集，要求输出必须过校验，否则直接报错而不是猜测。
3. **加一层 step-level eval**(OpenAI 的 eval / trace grading 思路)——把“拒答后是否正确重问”“状态是否推进到位”作为固定回归门，避免以后再漂。
4. **继续收敛通用 helper**——把 `promptedPatterns`、拒答词、兜底策略改成配置化注册，供所有 skill 复用。
