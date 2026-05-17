# Skills

## 入口

- Skill 接口:`shared/skill.ts`(`Skill` / `SkillEventInput` / `SkillContext` / `RouterDecision`)
- Skill 注册:`server/skills/registry.ts`(`registerAllSkills` 一键)
- 8 Skill 入口:`server/skills/{onboarding,sceneSelect,practice,grade,explain,review,retry,generalChat}.ts`
- AI Provider 接口:`server/ai/types.ts`
- Provider 工厂:`server/ai/providers/index.ts`(根据 `AI_PROVIDER` 选 Stub | Anthropic)
- AI Router:`server/ai/router.ts`(`createAIRouter`)

## 关键源码

8 Skill 与主 Widget 映射:

| Skill          | allowedStates                                              | primaryWidget       |
|----------------|------------------------------------------------------------|---------------------|
| onboarding     | onboarding                                                  | (无)                |
| scene-select   | scene_selecting / awaiting_next / reviewing / practicing    | scene-cards         |
| practice       | scene_selecting / practicing / awaiting_next                | exercise-card       |
| grade          | practicing / grading                                        | grading-result      |
| explain        | practicing / grading / awaiting_next / reviewing / scene_selecting | follow-up-source |
| review         | awaiting_next / reviewing / scene_selecting / archived      | progress-summary / answer-review |
| retry          | awaiting_next / reviewing / scene_selecting / practicing     | exercise-card       |
| general-chat   | (空数组 = 任意态;practicing/grading 由 chat route 禁止降级闲聊) | intent-confirm / (无) |

## Stub / fallback 行为

028 起 8 个 Skill 都已有真实或确定性实现:`general-chat` 在真实 Provider 提供 `chat()` 时会流式生成低风险闲聊;在 stub provider 或 provider 不支持 `chat()` 时,保留规则化 fallback 文本。`general-chat` 仍承担低置信度 `intent-confirm` 输出。

- `StubProvider.route()` 固定返回 `{ skillName: 'general-chat', confidence: 0.6, ... }`
- `StubProvider` 不实现 `chat()`(可选接口),onboarding / scene-select / grade 等需 LLM 的 skill 在 stub provider 下会 yield error;`general-chat` 在 stub 下会返回规则化引导文本
- 各 stub Skill handler 产出:1-2 条 text-chunk + 必要的 mode-switch + widget-init/ready + done
- `general-chat` 默认纯文本;当 `params.intentConfirm` 存在时输出 `intent-confirm` widget

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
- 036 起,用户选定场景并成功生成 `scene_dialogue` 后,会把 `conversations.title` 更新为当前场景标题,用于历史会话左栏展示。038 起前端 `scene-cards` 点击会把卡片 `title/description/knowledgePoint/difficulty` 一并传给 `select-scene`,后端优先使用这些元数据,旧客户端只传 sceneId 时仍按 sceneId 兼容推导。
- 失败恢复(005):`runScenePropose` 失败时,handler 会把已初始化的 `scene-cards` widget patch 为 `status='error'`,写入空 `cards` 与可读 `message`,随后 `mode-switch('chat')` 再发 `error` 终止。前端遇到历史 loading/空候选 widget 时也允许点击"重新生成场景"或直接输入主题,避免 `select` 输入模式永久卡住。
- 012 起,用户在 `practicing` 中输入 `换场景` / `换一批` / `重新生成场景` 会确定性路由到 `scene-select`;handler 先发 `state-transition('scene_selecting','scene-select')`,再输出 `mode-switch('select')` 和场景卡片,避免继续保持 practicing 导致卡片不可点。

## practice Skill(003 已真实接入,013 补齐阶段 1-4)

- 入口:`server/skills/practice.ts` + `server/skills/_helpers/practiceFsm.ts`
- 流程:`getActiveSceneDialogue` → `decideNextQuestion`(基于 `countStageHandled` 推进)→ `buildQuestionFromTurn`(阶段 1 挖词填空 / 阶段 2 中→英翻译 / 阶段 3 对话接龙 / 阶段 4 角色互换)→ `createAttempt` → widget exercise-card + mode-switch
- 阶段推进:每阶段 `STAGE_GOAL=2` 题,`MAX_STAGE_MVP=4`;`stage > MAX` 时 yield state-transition('awaiting_next')。027 起题卡 data 会下发 `totalStages=4` 和 `stageGoal=2`,前端可直接显示阶段/题内进度。
- 009/024 修正:阶段内下一题号按"当前阶段已处理数量 + 1"计算,不再按最大 `question_no + 1`;`graded + is_correct=1` 与 `needs_review` 都算已处理,避免旧的未答/错题/重复点击记录把阶段 2 推到第 6/7 题后找不到模板,也避免单题 2 次失败后永久卡在原题。
- 010 修正:阶段通过数按当前活跃 `scene_dialogue.sceneId` 统计,换新场景后不会继承旧场景的通过进度;`findLatestAttempt` 也支持按 sceneId 限定,避免新场景答案误绑定旧题。
- 013 扩展:阶段 3 `dialogue_chain` 展示上一句英文与目标中文意思,用户用英文接下一句;阶段 4 `role_reversal` 让用户扮演目标角色主动开口,答对后可追加展示下一句对方回应。023 起阶段 4 widget data 会单独下发 `targetZh`;026 起阶段 3 也用 `targetZh` 单独突出目标意思。前端以"请表达"目标句块突出用户需要用英文说出的中文句,角色只放在说明/提示里。阶段 3/4 在短对话中允许复用最后一组相邻 turn,减少后半场断流。
- **不调 LLM**:题目从结构化 `scene_dialogue.turns` 模板抽取,确定性。LLM 只在 scene 生成(sceneSelect)与批改(grade)用

## grade Skill(003 已真实接入)

- 入口:`server/skills/grade.ts` + `server/skills/_helpers/gradeFsm.ts`
- 流程:从 `ctx.params.action(submit-answer)` 拿 attemptId + answer → 锁定检查 → `markSubmitted` → `runGrading`(LLM tool `grade_answer`,三档 `category` + 12 错误标签 enum)→ `createGrading`(UPSERT 支持重批改)→ `markGraded`
- 008/010 兜底:若用户在 `practicing` 态直接输入非控制指令文本,chat route 会把当前活跃场景下最新可作答 attempt 自动包装成 `submit-answer` 并进入 grade;前端 chat/fill 输入同样优先提交最新可作答 exercise-card,但 `出题` / `下一题` / `go` 等控制指令会确定性进入 practice,避免阶段 2 chat 模式答案被当作 general chat。
- 008 批改 prompt 会从当前 `scene_dialogue` + attempt stage/questionNo 重新推导参考答案,并要求模型优先按参考答案批改,减少错题反馈漂移。
- 015 起批改后调用 `recordGradingLearningSignals`:根据 `corrections.tags` 写入 `error_tag_events`,并用错误 tag 或题型 fallback 更新 `mastery_records`。正确且无错误标签的题不会生成错误事件,但会更新对应题型掌握度。
- 主线错题 retry:错答 `incrementRetry`;第 1 次错保持当前题可再次提交,第 2 次错 `markNeedsReview` 后立即调用 `retry` 的 `replacement` 模式生成同知识点降难替换题。替换题通过后 `grade` 自动回到 `practice`,主线根据 `countStageHandled` 继续同阶段下一题。替换题不计入 3 题专项重练额度。
- 批改分档:021 起 `grade_answer` 输出 `category=exact/similar/incorrect`;`exact` 表示与参考表达完全匹配(忽略大小写、首尾空格、句末标点),`similar` 表示意思相近且语法可接受,`incorrect` 表示语法、拼写或意思不一致。`isCorrect` 仍保留给数据闭环,规则为 `exact/similar=true`,`incorrect=false`;百分制 `score` 只用于内部统计,前端批改卡不展示。
- 阶段判断:本题为 `exact/similar` 后,若本阶段未完成会立即调用 `practice` 自动出下一题;若本阶段完成但未到阶段 4,自动进入下一阶段第一题;若 `countStagePassed >= STAGE_GOAL` 且 `stage >= MAX_STAGE_MVP(4)` → state-transition('awaiting_next')。阶段 4 答对时如存在下一句对方回应,会在批改后追加自然文本展示。

## review Skill(015 已真实接入)

- 入口:`server/skills/review.ts`
- 数据源:当前会话最新 `scene_dialogue`、同 scene 的 `exercise_attempts + grading_results`、`error_tag_events`、`mastery_records`;不从消息正文解析。
- 无批改记录:yield `state-transition('reviewing','review')` + 友好文本 + `done`,不初始化空 `progress-summary`。
- 有批改记录:输出本轮题数与三档分布文本,随后 `widget-init(progress-summary loading)` → `widget-ready(progress-summary ready)`,再输出 `answer-review` 逐题回看。
- `progress-summary` data 包含:`title/sceneName/questionsCount/averageScore/averageScoreDelta/categoryCounts/weakTagsCount/masteredScenesCount/masteries/strongPoints/weakPoints/nextSuggestions`。`averageScore` 仍保留给兼容和统计,但前端 029 起不再展示平均分,改展示 `categoryCounts(exact/similar/incorrect)`;当前 `averageScoreDelta/mastery.delta` 尚无历史基线,固定为 0。
- `answer-review` data 包含:`title/items[]`;item 从 `exercise_attempts + grading_results` 生成,包含顺序题号、短题干、题型、分数、状态(ok/warn/bad)和错误标签。017 起同一条 assistant 消息可保存并渲染多个 widget snapshot,所以复盘总览和逐题回看会连续出现。
- 015 起 `/api/chat/send` 在 `awaiting_next` / `reviewing` 下识别 `复盘` / `总结` / `学习报告` / `review`,确定性路由到 `review`,不经过 AI Router。

## retry Skill(016 已真实接入)

- 入口:`server/skills/retry.ts`
- 触发:`awaiting_next` / `reviewing` / `scene_selecting` / `practicing` 下输入 `重练` / `重练错题` / `开始重练` / `retry`,或 `重练 <tag>` 指定薄弱点;chat route 确定性路由到 `retry`,不新增 ChatAction。
- 选点:优先使用 `params.targetTag`,其次按当前场景的 `error_tag_events` 聚合次数选最高频 tag,再退到用户 `mastery_records` 中低于 80 分的最低掌握度 tag。
- 出题:生成 3 道降难专项题,使用内部 `stage=5`,写入 `exercise_attempts`;前端展示为"重练 · 第 N/3 题",不暴露阶段 5。
- 批改:复用 `grade` Skill。016 起 `exercise_attempts.prompt` 可存一层轻量 JSON,记录显示题干、参考答案和目标 tag;024 起 `kind` 支持 `retry` / `replacement`,替换题还会记录 `sourceAttemptId`;`gradeFsm` 会解析后稳定批改。历史普通字符串 prompt 仍兼容。
- 推进:021 起重练第 1/2 题通过后由 `grade` 自动调用 `retry` 生成下一道专项题,并保持 `practicing + activeSkill=retry`;`next-question` 在 activeSkill 为 retry 时仍可继续路由 `retry` 作为兼容。第 3 道重练题通过或 retry 已生成 3 题后,转 `reviewing`。024 起 `mode='replacement'` 只生成单道替换题,通过后回主线 `practice`,不转 `reviewing`。

## explain Skill(019 已真实接入)

- 入口:`server/skills/explain.ts`
- 触发:`practicing` / `grading` / `awaiting_next` / `reviewing` / `scene_selecting` 下输入 `为什么` / `为什么错` / `解释` / `怎么改` / `why` / `explain` 等文本;chat route 确定性路由到 `explain`,不经过 AI Router,也不把这类文本误提交为答案。
- 数据源:当前会话最近一条 `exercise_attempts`,优先携带对应 `grading_results`。不会从自然语言消息里解析答案。
- 未批改题:输出 `follow-up-source(sourceKind='exercise')` + 提示性解释,只讲思路和题型策略,不泄露标准答案。
- 已批改题:输出 `follow-up-source(sourceKind='grading')` + 基于用户答案、参考表达、批改解释和错误标签的中文解析。当前最小闭环仍在主消息流中展示,完整右侧 branch thread 面板未接入。

## 辅助追问支线(030 第一版)

- 入口:`server/services/branchThread.ts` + `server/routes/chat.ts` 的 `/api/chat/conversations/:id/branch-threads` 与 `/api/chat/branch-threads/:threadId/messages`。
- 数据模型:支线元信息写 `branch_threads`,支线聊天写 `messages.branch_thread_id`;主线历史查询只返回 `branch_thread_id IS NULL`。
- 来源校验:创建支线时 `sourceMessageId` 必须属于当前用户当前会话;`sourceRef` 可携带 message / widget / attempt / grading 等稳定引用,由调用方决定。
- 生成回复:032 起若 Provider 支持 `chat()`,支线会用来源上下文 + 用户追问调用真实 LLM;033 起同一支线下最多 20 条历史 user/assistant 消息会一起传给 Provider,支持连续追问。stub 或 Provider 不支持 `chat()` 时返回确定性安全提示。Provider chat 抛错会返回 `502 PROVIDER_ERROR`,不静默降级。
- 状态隔离:支线发送不会调用 AI Router 或 Skill handler,不会生成 `agent_runs` / SSE,不会改变 `learning_state` / `active_skill` / `input_mode`,也不会写学习统计。
- 防泄露:当主会话处于 locked(`practicing` / `grading`)时,支线 prompt 不携带来源正文,回复不复述来源消息正文,只说明基于第 N 条消息解释,并声明不会泄露标准答案或完整翻译。

## general-chat / intent-confirm(020/028 已真实接入)

- 默认闲聊在 `ctx.params.userText` 存在且 Provider 支持 `chat()` 时,会调用真实 LLM 流式输出;系统 prompt 限制其只能进行低风险闲聊,并优先引导用户回到"开始练习 / 换场景 / 复盘 / 重练"。Provider 不支持 `chat()` 时,保留简短规则化回复。
- Provider chat 抛错时 yield `GENERAL_CHAT_FAILED`,不静默 fallback 到规则文本,符合真实 Provider 错误显式暴露约束。
- AI Router 返回低置信度(`confidence < 0.5`)且当前状态为 `scene_selecting` / `awaiting_next` / `reviewing` 时,chat route 会把 decision 改写为 `general-chat` + `params.intentConfirm`,由 `generalChatSkill` 输出 `intent-confirm` widget。
- `intent-confirm` choices 的 `action` 是字符串协议,前端解析 `action:request-new-scenes` / `action:next-question` 为既有 ChatAction,解析 `text:<内容>` 为普通文本发送;不新增 ChatAction。
- `practicing` / `grading` 中若 Router 试图降级到 `general-chat`,chat route 直接返回 `400 VALIDATION_FAILED`,避免练习/批改被闲聊兜底带偏。

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
- `state-transition` 由 chat route 统一落 `conversations.learning_state / active_skill / lock_policy`;018 起 `practicing` / `grading` 自动 locked,其他状态自动 open,skill 不自行维护锁定字段
- 前端流式消费 `widget-init` / `widget-ready` / `widget-update` 时,必须同时更新 `activeWidgets` 与当前 assistant 消息的 `widgetSnapshot`;否则 widget 只会在刷新后从数据库快照出现。
- 任意 handler 抛错 → 路由 catch → 发 `error` 事件 → `agent_runs.status = 'failed'`
- `practicing` / `grading` 中 router 校验失败时**直接抛错**(不再 fallback,002 patch)
- AI Provider 抛错时 router 不 catch,直接传播到 chat 路由,返 `502 PROVIDER_ERROR`
- POST `/api/chat/send` body `text` 与 `action` **二选一**(zod refine);action 由 chat route 确定性映射到 skill,并放入 `decision.params.action`
- 008 起练习态直接输入答案时,chat route 可能把 `text` 规范化为 `submit-answer` action;消息历史仍保存用户原始输入文本。010 起 `awaiting_next` 下输入 `next` / `START` / `开始练习` 会确定性触发 `request-new-scenes`,减少完成一场景后的断流。012 起 `practicing` 下的换场景类文本也确定性触发 `request-new-scenes`,不再交给 AI Router。015 起 `awaiting_next` / `reviewing` 下的复盘类文本确定性触发 `review`。016 起重练类文本确定性触发 `retry`;若 activeSkill 为 `retry`,结构化 `next-question` 继续走 `retry` 而不是主线 `practice`。019 起解释类文本确定性触发 `explain`,并在练习中优先于自由文本答案兜底,避免"为什么错"被当成答案提交。020 起非锁定态低置信度路由改为 `intent-confirm`;锁定态不允许降级到 `general-chat`。

## 测试入口

- AI Router 校验链测试:`server/__tests__/ai-router.test.ts`(5 测试,正常路径 + 3 失败路径 + 任意 state)
- onboarding skill 单测:`server/__tests__/skill-onboarding.test.ts`(5 测试)
- scene-select 单测:`server/__tests__/skill-sceneSelect.test.ts`(6 测试)
- practice 单测:`server/__tests__/skill-practice.test.ts`(10 测试)
- grade 单测:`server/__tests__/skill-grade.test.ts`(16 测试)
- review 单测:`server/__tests__/skill-review.test.ts`(2 测试,覆盖 progress-summary + answer-review)
- retry 单测:`server/__tests__/skill-retry.test.ts`(5 测试)
- explain 单测:`server/__tests__/skill-explain.test.ts`(3 测试,覆盖已批改解释、未批改不泄露答案、无上下文提示)
- general-chat 单测:`server/__tests__/skill-generalChat.test.ts`(4 测试,覆盖默认文本、真实 provider 流式文本、provider 错误和 intent-confirm widget)
- learning services 单测:`server/__tests__/learning-services.test.ts`(13 测试,含 learning_state → lock_policy)
- onboarding 端到端:`npm run test:smoke:onboarding`(10 场景)
- 学习闭环端到端:`npm run test:smoke:learning`(13 场景,覆盖 4 阶段完整闭环、错题重试、explain 追问、低置信度确认、状态拒绝、archived 只读与 provider 错误路径)
- 真实 Provider 接入:`npm run test:smoke:ai`(需双 key)

## Pending

- general-chat 开放闲聊内容生成待真实化(留 004+)
- Skill 取消机制:`ctx.signal` 已传入,onboarding 已消费;其他 7 stub/真实 skill 尚未消费
- `agent_runs.payload` 字段写入 finalSeq 与累计文本长度的细节
