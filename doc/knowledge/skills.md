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

## Stub 行为(剩余 4 个 stub)

剩余 stub:`explain` / `review` / `retry` / `general-chat`。其余 4 个(onboarding/scene-select/practice/grade)已 002+003 真实接入。

- `StubProvider.route()` 固定返回 `{ skillName: 'general-chat', confidence: 0.6, ... }`
- `StubProvider` 不实现 `chat()`(可选接口),onboarding / scene-select / grade 等需 LLM 的 skill 在 stub provider 下会 yield error
- 各 stub Skill handler 产出:1-2 条 text-chunk + 必要的 mode-switch + widget-init/ready + done
- `general-chat` 与 `explain` 不产 widget,纯文本流

## 真实 Provider 接入(002)

- **Anthropic**(`AnthropicProvider`):`route()` 默认用 `tool_use`(`route_to_skill` 工具)强制 JSON;`chat()` 用 `messages.stream`,转 `ChatStreamEvent`(text-delta / tool-use / message-stop)
- **OpenAI**(`OpenAIProvider`):`route()` 默认用 function calling(`tool_choice: {type: 'function', function: {name: 'route_to_skill'}}`)强制 JSON;`chat()` 用 `chat.completions.create({stream: true})`,delta 累积成 ChatStreamEvent
- 两者均通过相同 `AIProvider` 接口暴露,skill handler 不感知具体 provider
- 缺 key / endpoint 不可达 → `createProvider` 抛错;route 失败 → `decide` 抛错 → chat.ts 返 502
- 同时验证两个 provider:`npm run test:smoke:ai`(严格模式,任一 key 缺即报错)

### DeepSeek 兼容约束(004)

`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` 指向 `api.deepseek.com` 时,Provider 仍传 `tools` 和结构化 prompt,但不再发送 `tool_choice` 字段。原因:`deepseek-reasoner` 以及 DeepSeek 兼容端在强制指定工具(`tool_choice` 指向具体 tool/function)时可能直接返回 400 `does not support this tool_choice`。省略后走模型默认 auto tool calling,避免用户输入"换场景"后在 `scene-select` 的 `propose_scenes` / `generate_scene_dialogue` 路径报错。

`route()` 仍会在 DeepSeek endpoint 附加 `thinking: { type: 'disabled' }`;`chat()` 不强制关闭 thinking,只移除 `tool_choice`。如果模型未按 prompt 产生 tool-use,对应 skill 仍会显式报错(例如"LLM 未返回有效场景候选"),不静默降级到 `stub` 或 `general-chat`。

## Onboarding Skill(002 已真实接入)

- 入口:`server/skills/onboarding.ts` + `server/skills/_helpers/onboardingFsm.ts`
- 流程:`ensureProfile` → `decideMissingRequired`(短路判定)/ `decidePromptMissingFields`(prompt 措辞)→ `buildSystemPrompt` → `provider.chat()` 流式
- 工具:`update_profile`(name/age/grade/level,LLM tool_use)
- 落库:tool input 在流结束后一次性 `upsertProfile`
- 完成判定:`isOnboardingComplete = !!(name && level)`,完成后 yield `state-transition('scene_selecting', null)`
- 短路:已完成时跳过 LLM 调用,直接 yield text-chunk + state-transition + done

## scene-select Skill(003 已真实接入)

- 入口:`server/skills/sceneSelect.ts` + `server/skills/_helpers/sceneSelectFsm.ts`
- **两分支**(由 `ctx.params.action` 决定):
  - 默认 / `action=request-new-scenes` → `runScenePropose`(LLM 出 20 候选)→ `selectTopK`(去重 + 难度优先)→ widget scene-cards
  - `action=select-scene` → `runDialogueGeneration`(LLM 生成完整双语对话)→ `createSceneDialogue` + `appendSceneHistory` → 串接 `practiceSkill.handler` 自动生成第一题
- 工具:`propose_scenes`(批量场景候选)+ `generate_scene_dialogue`(完整对话 JSON)
- 已用队列:`scene_history` 表 max 10 per user,服务层 prune
- 失败恢复(005):`runScenePropose` 失败时,handler 会把已初始化的 `scene-cards` widget patch 为 `status='error'`,写入空 `cards` 与可读 `message`,随后 `mode-switch('chat')` 再发 `error` 终止。前端遇到历史 loading/空候选 widget 时也允许点击"重新生成场景"或直接输入主题,避免 `select` 输入模式永久卡住。

## practice Skill(003 已真实接入,MVP 阶段 1+2)

- 入口:`server/skills/practice.ts` + `server/skills/_helpers/practiceFsm.ts`
- 流程:`getActiveSceneDialogue` → `decideNextQuestion`(基于 `countStagePassed` 推进)→ `buildQuestionFromTurn`(阶段 1 挖词填空 / 阶段 2 中→英翻译)→ `createAttempt` → widget exercise-card + mode-switch
- 阶段推进:每阶段 `STAGE_GOAL=2` 题,MVP `MAX_STAGE_MVP=2`;`stage > MAX` 时 yield state-transition('awaiting_next')
- 009 修正:阶段内下一题号按"当前阶段已通过数量 + 1"计算,不再按最大 `question_no + 1`;避免旧的未答/错题/重复点击记录把阶段 2 推到第 6/7 题后找不到模板。
- 010 修正:阶段通过数按当前活跃 `scene_dialogue.sceneId` 统计,换新场景后不会继承旧场景的通过进度;`findLatestAttempt` 也支持按 sceneId 限定,避免新场景答案误绑定旧题。
- **不调 LLM**:题目从结构化 `scene_dialogue.turns` 模板抽取,确定性。LLM 只在 scene 生成(sceneSelect)与批改(grade)用

## grade Skill(003 已真实接入)

- 入口:`server/skills/grade.ts` + `server/skills/_helpers/gradeFsm.ts`
- 流程:从 `ctx.params.action(submit-answer)` 拿 attemptId + answer → 锁定检查 → `markSubmitted` → `runGrading`(LLM tool `grade_answer`,12 错误标签 enum)→ `createGrading`(UPSERT 支持重批改)→ `markGraded`
- 008/010 兜底:若用户在 `practicing` 态直接输入非控制指令文本,chat route 会把当前活跃场景下最新可作答 attempt 自动包装成 `submit-answer` 并进入 grade;前端 chat/fill 输入同样优先提交最新可作答 exercise-card,但 `出题` / `下一题` / `go` 等控制指令会确定性进入 practice,避免阶段 2 chat 模式答案被当作 general chat。
- 008 批改 prompt 会从当前 `scene_dialogue` + attempt stage/questionNo 重新推导参考答案,并要求模型优先按参考答案批改,减少错题反馈漂移。
- retry:错答 `incrementRetry`,达 2 次 `markNeedsReview`(MVP 不出降难替换题,留 004)
- 阶段判断:本题对答且 `countStagePassed >= STAGE_GOAL` 且 `stage >= MAX_STAGE_MVP` → state-transition('awaiting_next')

## AI Router 校验链

```
provider.route()
  → 校验 skillName ∈ skillRegistry(失败抛 RouterValidationError)
  → 校验 currentLearningState ∈ skill.allowedStates(空数组视为任意态;失败抛 RouterValidationError)
  → 任一失败 → 错误向上传播
```

**无 fallback**(002 patch):provider 抛错或 router 校验失败不会降级到 general-chat,而是抛错。chat 路由 `/api/chat/send` catch 后返 `502 PROVIDER_ERROR`,前端看到具体原因。设计意图:让上游问题立即暴露,避免误以为系统正常。`scripts/diag-{anthropic,openai}.ts` 提供绕开 router 的直接诊断入口。007 起结构化 `action` 不走 AI Router,直接确定性映射 Skill 并校验 allowedStates。

## 约束与失败点

- handler 不直接写库**业务事件**(text-chunk / widget-* 由 chat.ts 落 messages.stream_events);**确实需要的业务表写入**(profile / scene_dialogues / scene_history / exercise_attempts / grading_results)由 skill 直接通过 service 写,因为这些是结构化业务数据,与事件流分离
- 前端流式消费 `widget-init` / `widget-ready` / `widget-update` 时,必须同时更新 `activeWidgets` 与当前 assistant 消息的 `widgetSnapshot`;否则 widget 只会在刷新后从数据库快照出现。
- 任意 handler 抛错 → 路由 catch → 发 `error` 事件 → `agent_runs.status = 'failed'`
- `practicing` / `grading` 中 router 校验失败时**直接抛错**(不再 fallback,002 patch)
- AI Provider 抛错时 router 不 catch,直接传播到 chat 路由,返 `502 PROVIDER_ERROR`
- POST `/api/chat/send` body `text` 与 `action` **二选一**(zod refine);action 由 chat route 确定性映射到 skill,并放入 `decision.params.action`
- 008 起练习态直接输入答案时,chat route 可能把 `text` 规范化为 `submit-answer` action;消息历史仍保存用户原始输入文本。010 起 `awaiting_next` 下输入 `next` / `START` / `开始练习` 会确定性触发 `request-new-scenes`,减少完成一场景后的断流。

## 测试入口

- AI Router 校验链测试:`server/__tests__/ai-router.test.ts`(5 测试,正常路径 + 3 失败路径 + 任意 state)
- onboarding skill 单测:`server/__tests__/skill-onboarding.test.ts`(5 测试)
- scene-select 单测:`server/__tests__/skill-sceneSelect.test.ts`(5 测试)
- practice 单测:`server/__tests__/skill-practice.test.ts`(5 测试)
- grade 单测:`server/__tests__/skill-grade.test.ts`(6 测试)
- learning services 单测:`server/__tests__/learning-services.test.ts`(12 测试)
- onboarding 端到端:`npm run test:smoke:onboarding`(10 场景)
- 学习闭环端到端:`npm run test:smoke:learning`(10 场景,覆盖 PRD §5.1+§5.2 验收 8/11 条)
- 真实 Provider 接入:`npm run test:smoke:ai`(需双 key)

## Pending

- explain / review / retry / general-chat 4 stub 待真实化(留 004+)
- 真实 Anthropic Provider `route()` 低置信度处理(<0.5 触发 intent-confirm widget)未实现
- Skill 取消机制:`ctx.signal` 已传入,onboarding 已消费;其他 6 stub/真实 skill 尚未消费
- `agent_runs.payload` 字段写入 finalSeq 与累计文本长度的细节
- mastery_records + error_tag_events 写入(留 004 闭环质量任务)
