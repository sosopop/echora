# API Contract

## 入口

- 路由装配:`server/createApp.ts`
- 错误响应格式:`server/middleware/error.ts`
- 错误码常量:`shared/errors.ts`
- DTO 类型:`shared/api.ts`

## 关键源码

### 鉴权(`server/routes/auth.ts`)

| Method | Path                | 说明                                                           |
|--------|---------------------|----------------------------------------------------------------|
| POST   | /api/auth/register  | { email, password } → token+user;同事务 `ensureProfile`        |
| POST   | /api/auth/login     | { email, password } → token+user                               |
| GET    | /api/auth/me        | (需 token) → { id, email, profile, onboardingCompleted }       |

`/me` 的 `onboardingCompleted` = `!!(profile.name && profile.level)`,前端 RouteGuard 用此字段决策是否跳转 onboarding。

JWT 7 天过期,V1 无刷新令牌。密钥来自 `JWT_SECRET`。

### 用户画像(`server/routes/profile.ts`,002 新增)

| Method | Path           | 说明                                              |
|--------|----------------|---------------------------------------------------|
| GET    | /api/profile   | 当前用户画像(不存在自动 ensure 空行)             |
| PUT    | /api/profile   | partial 更新;`level` 只接受 CEFR(A1-C2)          |

请求/响应 DTO:`shared/api.ts` 中 `ProfileDTO` / `ProfileUpdateReq`。

### 会话与流(`server/routes/chat.ts`)

| Method | Path                                       | 说明                              |
|--------|--------------------------------------------|-----------------------------------|
| GET    | /api/chat/conversations                    | 当前用户会话列表                   |
| POST   | /api/chat/conversations                    | 新建空会话(可选 `learningState`)|
| GET    | /api/chat/conversations/:id/messages       | 历史消息                           |
| GET    | /api/chat/conversations/:id/scene-dialogue | 当前活跃 scene_dialogue(003 新增)|
| GET    | /api/chat/conversations/:id/branch-threads | 当前会话辅助追问支线列表          |
| POST   | /api/chat/conversations/:id/branch-threads | 创建辅助追问支线                  |
| GET    | /api/chat/branch-threads/:threadId/messages | 支线消息列表                     |
| POST   | /api/chat/branch-threads/:threadId/messages | 发送支线追问并获得支线回复       |
| POST   | /api/chat/send                             | 发消息 → { messageId, streamId, decision } |
| POST   | /api/chat/streams/:streamId/abort          | 停止当前用户正在生成的 Skill 流   |
| GET    | /api/chat/stream?streamId=&lastSeq=&token= | SSE 端点                           |

POST `/api/chat/conversations` body 可选 `{ learningState?: LearningState, title?: string }`,Onboarding 视图传 `learningState='onboarding'`。

POST `/api/chat/send` body(003 起 text 与 action 二选一):

```ts
{
  conversationId?: number;
  text?: string;          // 与 action 二选一
  action?: ChatAction;    // 与 text 二选一
  mode?: InputMode;
}

type ChatAction =
  | {
      type: 'select-scene';
      payload: {
        sceneId;
        title?;
        description?;
        knowledgePoint?;
        difficulty?;
        topic?;
      };
    }
  | { type: 'request-new-scenes' }
  | { type: 'submit-answer'; payload: { attemptId, answer } }
  | { type: 'skip-question'; payload: { attemptId } }
  | { type: 'next-question' };
```

`action` 与 `text` 二选一,zod refine 校验。前端 widget 交互(点击场景卡片、提交答案、下一题等)统一走 `action` 路径。007 起 action 不再交给 AI Router,而是由后端确定性映射到 Skill:`request-new-scenes` / `select-scene` → `scene-select`,`submit-answer` → `grade`,`next-question` / `skip-question` → `practice`;随后仍校验目标 Skill 是否允许当前 `learningState`。

046 起,`POST /api/chat/send` 响应可能包含 `archivedConversationId?: number`。当当前 active 会话处于 `awaiting_next` 或 `reviewing`,且用户选择继续下一轮/换场景(`request-new-scenes`)时,后端会先归档当前会话,再新建一个 `scene_selecting` 会话执行本次请求;响应中的 `conversationId` 是新会话 id,`archivedConversationId` 是刚归档的旧会话 id。前端收到不同 `conversationId` 时切换当前消息列表,清空旧 active widgets/支线状态,并刷新历史会话列表。

038 起,`select-scene.payload` 兼容两种形态:旧客户端只传 `{ sceneId }`,后端用 sceneId 推导最小场景;新客户端会随场景卡片传 `title/description/knowledgePoint/difficulty/topic`,后端优先使用这些元数据生成 `scene_dialogue` 并更新 `conversations.title`。

008 起,`practicing` 态下的自由文本会先检查当前会话最新 attempt:若最新题仍是 `pending/submitted`,或已 `graded` 但结果错误且 `retry_count < 2`,后端会把非控制指令文本规范化为 `submit-answer` action 并走 `grade`。010 起 answer 绑定只看当前活跃 `scene_dialogue.sceneId` 下的 latest attempt,避免换场景后误提交旧场景题目。`出题` / `开始练习` / `继续` / `下一题` / `go` / `next` 等继续指令在 `practicing` 中确定性映射为 `next-question`,`awaiting_next` / `scene_selecting` / `reviewing` 中映射为 `request-new-scenes`;012 起 `换场景` / `换一批` / `重新生成场景` 在 `practicing` 中也确定性映射为 `request-new-scenes`,避免绕回 AI Router 或被误判为答案。015 起,`awaiting_next` / `reviewing` 下的 `复盘` / `总结` / `学习报告` / `review` 会直接形成 `RouterDecision { skillName: 'review' }`,不新增 ChatAction。042 起,`scene_selecting` / `practicing` / `awaiting_next` / `reviewing` 下的 `太难` / `简单一点` / `too hard` / `easier` 会把用户画像 `level` 下调一档并路由到 `scene-select + request-new-scenes`;`太简单` / `难一点` / `too easy` / `harder` 会上调一档。`decision.params.difficultyFeedback` 携带 `{ direction, previousLevel, nextLevel, changed }`,供 `scene-select` 输出自然解释。

043 起,阶段 4 达标后的 `grade` 流会在进入 `awaiting_next` 前自动评估最近 2 个完整场景表现并更新 `user_profiles.level`。该能力不新增 ChatAction、路由参数或 widget schema;若触发升/降级,只是在同一条 assistant 事件流中追加自然语言说明,客户端按普通 `text-chunk` 渲染即可。

`review` 返回的 `progress-summary` widget 继续使用 `shared/widget.ts` 既有 schema。批改后服务端会把 `grading_results.corrections.tags` 写入 `error_tag_events`,并更新 `mastery_records`;正确且无 tag 的题不会写错误事件,但会以题型作为 fallback tag 更新掌握度。

029 起,`progress-summary.data` 增加 `categoryCounts?: { exact; similar; incorrect }`;`averageScore` 继续保留为兼容字段,但正式前端组件优先展示三档分布,不再把平均分作为用户可见主指标。

021 起,`grading-result` widget 的 `data` 增加 `category?: 'exact' | 'similar' | 'incorrect'`。`score/isCorrect` 为兼容历史与统计仍保留,但前端正式卡片只展示三档文案:"完全正确"(exact,与参考表达完全匹配)、"还不错"(similar,意思相近可通过)、"错误"(incorrect,语法/拼写/意思不一致)。`submit-answer` 批改为 exact/similar 后,同一条 SkillEvent 流会继续输出下一题的 `exercise-card`;调用方不需要再触发 `next-question`。

023 起,`exercise-card` widget 的 `data` 支持 `targetZh?: string`。阶段 4 `role_reversal` 使用该字段突出用户需要表达的中文目标句,例如 `targetZh: "你好！我想买一张票。"`;026 起阶段 3 `dialogue_chain` 也使用该字段突出"目标意思"。角色信息继续放在 `contextZh/hint` 中,不再用醒目的 `contextEn` 块展示 `Your role`。

024 起,`exercise-card` widget 的 `data` 支持 `remediationKind?: 'retry' | 'replacement'`。内部 `stage=5` 的专项重练题使用 `remediationKind='retry'` 或省略时前端显示"重练";主线题第 2 次错误后自动生成的降难替换题使用 `remediationKind='replacement'`,前端显示"替换题"。

027 起,`exercise-card` widget 的 `data` 支持 `totalStages?: number` 与 `stageGoal?: number`。045 起主线 `practice` 还会下发 `totalQuestions?: number`,并按当前 `scene_dialogues.difficulty` 动态设置 `stageGoal`:A1/A2 总 5 题(2/1/1/1),B1/B2 总 8 题(2/2/2/2),C1/C2 总 10 题(3/3/2/2)。`retry` 下发 `stageGoal=3`,替换题下发 `stageGoal=1`。

017 起,`review` 同一条 assistant 消息会连续返回 `progress-summary` 与 `answer-review` 两个 widget。`messages.widget_snapshot` 兼容两种形态:历史单 widget object,以及多 widget array。前端 `MessageList` 会按数组顺序渲染多个 `WidgetSlot`;后端 `appendStreamEvent` 也会按 widget id upsert,避免后一个 widget 覆盖前一个 widget。

016 起,`awaiting_next` / `reviewing` / `scene_selecting` / `practicing` 下的 `重练` / `重练错题` / `开始重练` / `retry` 会确定性形成 `RouterDecision { skillName: 'retry' }`;`重练 <tag>` 会把 `<tag>` 写入 `decision.params.targetTag`。不新增 ChatAction。若会话 `activeSkill='retry'`,结构化 `{ type: 'next-question' }` 会继续路由 `retry`,否则仍路由 `practice`。

025 起,若会话 `status='archived'` 或 `learningState='archived'`,POST `/api/chat/send` 只允许复盘类文本(`复盘` / `总结` / `学习报告` / `review`)进入 `review`;其他文本或 action 直接返回 `400 VALIDATION_FAILED`,且不会创建新的 message / agent_run / stream。046 起,active 的已完成/复盘会话通过 `request-new-scenes` 开新一轮时会自动归档旧会话;已经归档的会话仍保持只读规则。

030 起,辅助追问第一版接入真实 `branch_threads` 与 `messages.branch_thread_id`:

```ts
interface BranchThreadCreateReq {
  sourceMessageId: number;
  sourceRef?: unknown;
}

interface BranchThreadDTO {
  id: number;
  userId: number;
  conversationId: number;
  sourceMessageId: number;
  sourceRef: unknown | null;
  status: 'open' | 'closed';
  createdAt: string;
}
```

`POST /api/chat/conversations/:id/branch-threads` 会校验来源消息必须属于当前会话。`GET /api/chat/conversations/:id/messages` 默认只返回主线消息(`branch_thread_id IS NULL`),支线消息只能通过 `/api/chat/branch-threads/:threadId/messages` 读取。`POST /api/chat/branch-threads/:threadId/messages` 会同步写入一条支线 user message 与一条支线 assistant message,不创建 `agent_runs`,不触发 `SkillEvent`/SSE,也不改变 `learning_state` / `active_skill` / `input_mode`。032 起,支线回复在 Provider 支持 `chat()` 时使用真实 LLM 生成;stub 或 Provider 不支持 `chat()` 时保留确定性安全提示。033 起,Provider prompt 会携带同一 `branchThreadId` 下最多 20 条历史支线消息,用于连续追问。Provider chat 抛错会返回 `502 PROVIDER_ERROR`,不静默 fallback。主线锁定(`practicing` / `grading`)时,支线 prompt 与回复都不会复述来源消息正文,避免绕过历史答案脱敏。

044 起,`POST /api/chat/branch-threads/:threadId/review` 支持把一条辅助追问显式加入复盘。接口只接受来源消息中能解析到 `grading-result.attemptId` 或 `follow-up-source.data.reviewContext.attemptId` 的支线,且该 attempt 必须已有批改和错误标签;普通消息、未批改题或无错误标签批改会返回 `400 VALIDATION_FAILED`。接口会幂等补写缺失的 `error_tag_events(included_in_stats=1)`,并只对新增事件更新 `mastery_records`,避免重复点击刷高统计。不新增 ChatAction。

018 起,`conversations.lock_policy` 由 `learning_state` 自动维护:`practicing` / `grading` 写为 `locked`,其余学习态写为 `open`。`GET /api/chat/conversations/:id/messages` 在 locked 状态下会对历史消息做服务端脱敏:

- 用户答题消息替换为 `"完成当前题后查看完整答案"`
- `grade` assistant 消息正文清空,`grading-result` widget 替换为 `conversation-lock`
- 解锁态(`awaiting_next` / `reviewing` 等)返回原始历史消息和原始 widget snapshot

019 起,`practicing` / `grading` / `awaiting_next` / `reviewing` / `scene_selecting` 下的 `为什么` / `为什么错` / `解释` / `怎么改` / `why` / `explain` 等文本会确定性形成 `RouterDecision { skillName: 'explain' }`;该判断发生在自由文本答案兜底之前,避免解释追问被误提交为答案。不新增 ChatAction。

`explain` 返回 `follow-up-source` widget + 文本解释:

- 未批改题:`sourceKind='exercise'`,只给提示,不返回参考答案
- 已批改题:`sourceKind='grading'`,可使用 `user_answer`、`referenceAnswer`、`explanation`、`tags` 解释错因
- 044 起,已批改且有错误标签时,`follow-up-source.data.reviewContext` 携带 `{ attemptId, gradingId, tags }`,供支线面板判断是否显示“加入复盘”。

020 起,自由文本交给 AI Router 后,若返回 `confidence < 0.5` 且当前学习态为 `scene_selecting` / `awaiting_next` / `reviewing`,chat route 不直接执行低置信度目标 Skill,而是改写为:

```ts
{
  skillName: 'general-chat',
  params: { intentConfirm: { question, prompt, choices, risk, originalDecision } },
  confidence: 1
}
```

`general-chat` 会返回 `intent-confirm` widget。`choices[].action` 是前端解析的字符串协议:

- `action:request-new-scenes` → `sendAction({ type: 'request-new-scenes' })`
- `action:next-question` → `sendAction({ type: 'next-question' })`
- `text:<内容>` → `sendMessage(<内容>)`
- `retry:<tag>` → `sendMessage("重练 <tag>")`

`practicing` / `grading` 中若 Router 试图降级到 `general-chat`,后端返回 `400 VALIDATION_FAILED`,避免练习或批改中被低置信闲聊兜底带偏。

040 起,输入框学习菜单与 `learning-menu` / `account-gate` / `intent-confirm` / `progress-summary` 按同一前端动作协议解析按钮动作。输入框菜单额外支持本地动作 `local:save-progress`,只显示"当前进度已自动保存"提示,不发网络请求,避免在 `practicing` 中被误提交为答案。

028 起,非锁定态下 AI Router 若高置信度选择 `general-chat`,chat route 会把用户原文写入 `decision.params.userText`;`general-chat` 在 Provider 支持 `chat()` 时用该文本生成真实流式闲聊,否则返回规则化引导。Provider chat 抛错会以 SSE `error` 事件返回 `GENERAL_CHAT_FAILED`。

016 起,重练题的 `exercise_attempts.prompt` 允许存储兼容 JSON 包装:

```json
{
  "__echoraPrompt": 1,
  "kind": "retry",
  "prompt": "Fill the blank: ...",
  "referenceAnswer": "to",
  "targetTag": "missing_word"
}
```

024 起 `kind` 也可以是 `"replacement"`,并可附带 `"sourceAttemptId": 123` 指向原始二次失败题。旧数据的纯字符串 prompt 仍按原逻辑处理。

006 起,结构化 `action` 在消息历史中显示为自然文案,不再暴露 `[action] {...}` 原始 JSON。008 起 `submit-answer` 显示用户真实答案,其他映射保持:`request-new-scenes` → "换一批场景",`select-scene` → "选择场景:<sceneId>",`skip-question` → "跳过本题",`next-question` → "下一题"。前端仍兼容历史 raw action 消息,渲染时会转为同一套文案。

## SSE 协议

- Content-Type: `text/event-stream`
- 每事件:`data: <JSON>\n\n`
- JSON shape:`SkillEvent`(`shared/skill.ts`,**9 类型**联合 + seq/streamId/timestamp 元数据;002 起新增 `state-transition`)
- 心跳:每 15s 注释行 `: ping`
- 重连:客户端用最新 `lastSeq` 续传;后端优先从内存 ring buffer(每流 200 条)replay,若 buffer 已过期或已被清空,会按 `streamId=stream-<assistantMessageId>-...` 回放 `messages.stream_events` 中已持久化的事件,确保流式历史可恢复
- 断线恢复:前端在最终 SSE 失败后会回退到 `GET /api/chat/conversations/:id/messages` 的历史消息快照,用 `widgetSnapshot` 重建当前界面;skill 自身的 `error` 事件仍按普通助手错误显示,不触发历史快照覆盖
- 停止生成(041):`POST /api/chat/streams/:streamId/abort` 仅能停止当前用户的活跃流。服务端 abort 对应 `AbortController`,把 `agent_runs.status` 写为 `aborted`,并补一条 `done` 事件(`payload.reason='aborted'`)让前端立刻退出流式状态;不存在或已结束的 stream 返回 `404 NOT_FOUND`。

## AI Provider 配置

`AI_PROVIDER=stub`(默认):零配置启动,所有 route 命中 general-chat。
`AI_PROVIDER=anthropic`:接入真实 Anthropic SDK,需要:

| env | 默认值 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (无) | 必填,空时降级到 stub |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | 自定义网关或中转(如 OpenRouter / Bedrock) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | 调用模型 ID |

`route()` 用 `tool_use` 强制 AI 输出结构化 RouterDecision(`route_to_skill` 工具)。
`chat()` 用 `messages.stream` 转换为 ChatStreamEvent(text-delta / tool-use / message-stop)。

## 响应格式

成功:
```json
{ "data": { ... } }
```

失败:
```json
{ "error": { "code": "ERROR_CODE", "message": "...", "details": { ... } } }
```

`NODE_ENV !== 'production'` 时,HTTP 错误响应会在 `details.debug` 或 `details.upstream` 中附带错误 name/message/stack 与上游状态码等调试字段;前端 dev 模式会在控制台打印完整 API/SSE 错误并把 details 拼进错误提示。生产环境不附带这些调试细节。

前端发送顺序(008):`useChatStore.sendMessage/sendAction` 会在 `/api/chat/send` 返回前先插入临时用户消息与空 assistant 消息;assistant 空流式消息渲染为 "Echo 正在思考中..."。服务端返回后再替换真实 messageId 并连接 SSE,随后 `text-chunk` / `widget-*` 覆盖为真实 AI 输出或小部件结果。

022 起,SSE `error` 事件不再只写入全局 error state,也会写回当前 assistant 消息正文,格式为 `出错了:<code>: <message>`;dev 模式下若事件携带 `details`,会追加 JSON 调试信息。这样 `GRADE_FAILED` / `ATTEMPT_LOCKED` / provider tool_choice 错误不会在聊天列表中表现为空白回复。

## 约束与失败点

- **EventSource 不支持自定义 Header**:SSE token 走 `?token=` 查询参数,V1 接受 URL 日志泄露风险,生产化前迁 fetch + ReadableStream
- **Express 5 SSE 资源泄漏**:必须 `req.on('close', () => streamBus.unsubscribe(...))`,否则订阅累积
- **CORS**:`CORS_ORIGIN` 默认 `http://localhost:5173`,多域用逗号分隔

## 测试入口

- supertest 在 `server/__tests__/` 下针对每个路由组写一个 `*.test.ts`
- E2E 在 `tests/smoke/run-smoke.ts` 覆盖完整链路;学习闭环 smoke `tests/smoke/run-smoke-learning.ts` 覆盖 archived 会话继续练习被拒的负样本

## Pending

- 错误响应是否需要 traceId 字段
- SSE 是否需要 Last-Event-ID 标准头(EventSource 自动支持)
