> 日期: 2026-05-17
> 序号: 004
> 任务: DeepSeek tool_choice 兼容修复

## 任务背景

用户在输入"换场景后"时遇到真实 Provider 400 错误:`deepseek-reasoner does not support this tool_choice`。排查后确认 `scene-select` 等真实 skill 会通过 `provider.chat()` 发送强制指定工具的 `tool_choice`,DeepSeek 兼容端在该形态下可能直接拒绝请求。

## 执行摘要

- `server/ai/providers/deepseek.ts` - 新增 `shouldOmitDeepSeekToolChoice()` helper,复用现有 `api.deepseek.com` endpoint 检测。
- `server/ai/providers/openai.ts` - OpenAI 兼容 Provider 在 DeepSeek baseURL 下仍传 `tools`,但省略 `tool_choice`;普通 OpenAI endpoint 保持原先 `auto` / 指定 function 映射。
- `server/ai/providers/anthropic.ts` - Anthropic 兼容 Provider 在 DeepSeek baseURL 下省略 `tool_choice`;普通 Anthropic endpoint 保持原先 `auto` / 指定 tool 映射。
- `server/__tests__/openai-provider.test.ts` - 新增 OpenAI tool_choice 映射与 DeepSeek endpoint 检测单测,覆盖非 DeepSeek 负样本。
- `server/__tests__/anthropic-provider.test.ts` - 补充 DeepSeek 兼容端省略 tool_choice 的单测。
- `doc/knowledge/skills.md` - 更新真实 Provider 知识文档,记录 DeepSeek 兼容端不再发送 `tool_choice` 的约束。

## 手工测试

### Provider tool_choice 映射

命令(可直接复制粘贴):

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath server/__tests__/anthropic-provider.test.ts server/__tests__/openai-provider.test.ts
```

输出:

```text
PASS server/__tests__/openai-provider.test.ts
PASS server/__tests__/anthropic-provider.test.ts

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```

负样本覆盖:

```text
openai-provider.test.ts: does not relax tool_choice for other providers
预期: https://api.openai.com/v1 与 https://api.anthropic.com 不触发 DeepSeek 兼容降级。
结果: 用例通过。
```

### 服务端类型检查

命令(可直接复制粘贴):

```powershell
npx tsc -p tsconfig.server.json --noEmit
```

输出:

```text
(无输出,退出码 0)
```

### scene-select 回归

命令(可直接复制粘贴):

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath server/__tests__/skill-sceneSelect.test.ts
```

输出:

```text
PASS server/__tests__/skill-sceneSelect.test.ts
  sceneSelect skill
    √ 无 action(默认)→ widget scene-cards + ready
    √ action=request-new-scenes → 候选过滤已用主题
    √ action=select-scene → 生成 dialogue + scene_history + state-transition
    √ propose 失败 → yield error,无 widget-ready
    √ dialogue 生成失败 → yield error,无 state-transition

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

负样本覆盖:

```text
propose 失败 → yield error,无 widget-ready
dialogue 生成失败 → yield error,无 state-transition
结果: 两个失败路径用例均通过,确认 Provider/Skill 失败仍显式暴露,不静默降级。
```

### 完整后端 Jest

命令(可直接复制粘贴):

```powershell
npm run test:server
```

输出:

```text
PASS server/__tests__/openai-provider.test.ts
PASS server/__tests__/profile.test.ts
PASS server/__tests__/skill-sceneSelect.test.ts
PASS server/__tests__/anthropic-provider.test.ts
PASS server/__tests__/auth-register-creates-profile.test.ts
PASS server/__tests__/learning-services.test.ts
PASS server/__tests__/health.test.ts
PASS server/__tests__/skill-practice.test.ts
PASS server/__tests__/skill-grade.test.ts
PASS server/__tests__/skill-onboarding.test.ts
PASS server/__tests__/ai-router.test.ts

Test Suites: 11 passed, 11 total
Tests:       56 passed, 56 total
```

### 总结

已跑过 4 / 4 步,全部通过。未运行真实 DeepSeek API 调用,因为当前任务不读取 `.env` 中的真实 `<API_KEY>`;建议用户环境配置好 DeepSeek key 后用同一"换场景"路径做一次端到端复测。

## 遗留 TODO

- [测试] 使用真实 `deepseek-reasoner` 或当前 DeepSeek V4 模型跑 `scripts/diag-openai.ts` / `scripts/diag-anthropic.ts` 以及 UI "换场景"端到端验证,记录实际响应。
- [后端] 如果 DeepSeek 在省略 `tool_choice` 后偶发自然语言而非 tool-use,可为 `scene-select` 增加 JSON 文本解析兜底或一次重试策略。
- [文档] `doc/knowledge/api-contract.md` 的 AI Provider 配置段仍偏 002 版本,后续可统一补齐 OpenAI provider 与 DeepSeek 兼容说明。

## 下一阶段建议

1. **真实 Provider 回归矩阵**(PRD §2.3,§3.5) - 为 OpenAI / Anthropic / DeepSeek 兼容端建立最小诊断矩阵,保证 Provider 失败显式暴露且不静默回退。
2. **场景生成稳定性**(PRD §2.5,§5.1) - 给 `scene-select` 增加结构化输出重试或文本 JSON 解析兜底,提升 3-5 个场景卡片生成成功率。
3. **非法状态动作验证**(PRD §3.5,§5.2) - 补齐 `grading` 中换场景、`archived` 中继续答题等负样本 API/Smoke 覆盖,避免主学习态被错误切换。
4. **批改闭环写入**(PRD §2.6,§2.7) - 推进 `error_tag_events` 与 `mastery_records` 持久化,让错因统计和复盘建议真正从结构化表驱动。
