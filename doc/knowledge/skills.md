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
- 每个 Skill stub handler 产出:1-2 条 text-chunk + 必要的 mode-switch + widget-init/ready + done
- `general-chat` 与 `onboarding` / `explain` 不产 widget,纯文本流

## AI Router 校验链

```
provider.route()
  → 校验 skillName ∈ skillRegistry
  → 校验 currentLearningState ∈ skill.allowedStates(空数组视为任意态)
  → 任一失败 → fallback 到 general-chat decision(rationale 注明原因)
```

## 约束与失败点

- handler 不直接写库,事件即唯一事实源:由 chat 路由消费 yield 时统一落 `messages.stream_events` JSON 数组
- 任意 handler 抛错 → 路由 catch → 发 `error` 事件 → `agent_runs.status = 'failed'`
- `practicing` / `grading` 中不得降级到 `general-chat`(由 router 二次校验保障)
- AI Provider 抛错时 router 自动降级到 general-chat 并 warn 日志,不阻断响应

## 测试入口

- AI Router 校验链测试:后续在 `server/__tests__/ai-router.test.ts`(暂未写)
- Skill stub 输出契约:在 `server/__tests__/skill-<name>.test.ts` 中覆盖各事件类型出现顺序

## Pending

- 真实 Anthropic Provider 接入(`server/ai/providers/anthropic.ts` 仅骨架)
- Skill 取消机制:`ctx.signal` 已传入,handler 内尚未消费
- `agent_runs.payload` 字段写入 finalSeq 与累计文本长度的细节
