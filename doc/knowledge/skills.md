# Skills

## 入口

- Skill 接口:`shared/skill.ts`(`Skill` / `SkillEventInput` / `SkillContext` / `RouterDecision`)
- Skill 注册:`server/skills/registry.ts`(`registerAllSkills` 一键)
- 8 Skill stub:`server/skills/{onboarding,sceneSelect,practice,grade,explain,review,retry,generalChat}.ts`
- AI Provider 接口:`server/ai/types.ts`
- Provider 工厂:`server/ai/providers/index.ts`(根据 `AI_PROVIDER` 选 Stub | Anthropic)
- AI Router:`server/ai/router.ts`(`createAIRouter`)

## 关键源码

8 Skill 与主 Widget 映射:

| Skill          | allowedStates                                              | primaryWidget       |
|----------------|------------------------------------------------------------|---------------------|
| onboarding     | onboarding                                                  | (无)                |
| scene-select   | scene_selecting / awaiting_next / reviewing                 | scene-cards         |
| practice       | scene_selecting / practicing / awaiting_next                | exercise-card       |
| grade          | practicing / grading                                        | grading-result      |
| explain        | practicing / grading / awaiting_next / reviewing / scene_selecting | (无)        |
| review         | awaiting_next / reviewing / scene_selecting / archived      | progress-summary    |
| retry          | awaiting_next / reviewing / scene_selecting                 | exercise-card       |
| general-chat   | (空数组 = 任意态)                                            | (无)                |

## Stub 行为

- `StubProvider.route()` 固定返回 `{ skillName: 'general-chat', confidence: 0.6, ... }`
- `StubProvider` 不实现 `chat()`(可选接口),onboarding 等需 LLM 的 skill 在 stub provider 下会 yield error
- 各 stub Skill handler 产出:1-2 条 text-chunk + 必要的 mode-switch + widget-init/ready + done
- `general-chat` 与 `explain` 不产 widget,纯文本流

## 真实 Provider 接入(002)

- **Anthropic**(`AnthropicProvider`):`route()` 用 `tool_use`(`route_to_skill` 工具)强制 JSON;`chat()` 用 `messages.stream`,转 `ChatStreamEvent`(text-delta / tool-use / message-stop)
- **OpenAI**(`OpenAIProvider`):`route()` 用 function calling(`tool_choice: {type: 'function', function: {name: 'route_to_skill'}}`)强制 JSON;`chat()` 用 `chat.completions.create({stream: true})`,delta 累积成 ChatStreamEvent
- 两者均通过相同 `AIProvider` 接口暴露,skill handler 不感知具体 provider
- 缺 key / endpoint 不可达 → `createProvider` 抛错;route 失败 → `decide` 抛错 → chat.ts 返 502
- 同时验证两个 provider:`npm run test:smoke:ai`(严格模式,任一 key 缺即报错)

## Onboarding Skill(002 已真实接入)

- 入口:`server/skills/onboarding.ts` + `server/skills/_helpers/onboardingFsm.ts`
- 流程:`ensureProfile` → `decideMissingFields` → `buildSystemPrompt` → `provider.chat()` 流式
- 工具:定义 `update_profile` tool,AI 通过 tool_use 提供清洗后的字段(name/age/grade/level)
- 落库:tool input 在流结束后一次性 `upsertProfile`
- 完成判定:`isOnboardingComplete = !!(name && level)`(必填),完成后 yield `state-transition('scene_selecting', null)`
- 短路:已完成时跳过 LLM 调用,直接 yield text-chunk + state-transition + done
- 依赖:`provider.chat` 必须存在(StubProvider 不支持时 yield error)

## AI Router 校验链

```
provider.route()
  → 校验 skillName ∈ skillRegistry(失败抛 RouterValidationError)
  → 校验 currentLearningState ∈ skill.allowedStates(空数组视为任意态;失败抛 RouterValidationError)
  → 任一失败 → 错误向上传播
```

**无 fallback**(002 patch):provider 抛错或 router 校验失败不会降级到 general-chat,而是抛错。chat 路由 `/api/chat/send` catch 后返 `502 PROVIDER_ERROR`,前端看到具体原因。设计意图:让上游问题立即暴露,避免误以为系统正常。`scripts/diag-{anthropic,openai}.ts` 提供绕开 router 直接调 provider 的诊断入口。

## 约束与失败点

- handler 不直接写库,事件即唯一事实源:由 chat 路由消费 yield 时统一落 `messages.stream_events` JSON 数组
- 任意 handler 抛错 → 路由 catch → 发 `error` 事件 → `agent_runs.status = 'failed'`
- `practicing` / `grading` 中 router 校验失败时**直接抛错**(不再 fallback 到 general-chat,002 patch)
- AI Provider 抛错时 router 不 catch,直接传播到 chat 路由,返 `502 PROVIDER_ERROR`

## 测试入口

- AI Router 校验链测试:后续在 `server/__tests__/ai-router.test.ts`(暂未写)
- Skill stub 输出契约:在 `server/__tests__/skill-<name>.test.ts` 中覆盖各事件类型出现顺序

## Pending

- 真实 Anthropic Provider `route()` 低置信度处理(<0.5 触发 intent-confirm widget)未实现
- Skill 取消机制:`ctx.signal` 已传入,onboarding 已消费;其他 7 stub 尚未消费
- `agent_runs.payload` 字段写入 finalSeq 与累计文本长度的细节
- grade skill 自身 yield state-transition 后,删除 chat.ts 兼容分支
