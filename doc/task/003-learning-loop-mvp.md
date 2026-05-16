> 日期: 2026-05-16
> 序号: 003
> 任务: 学习闭环 MVP — scene 对话生成 + 4 阶段练习首版(阶段 1+2) + Chat 视图 + 3 核心 widget

## 任务背景

002 onboarding 端到端落地后,新用户能注册 → 采集画像 → 跳转 /chat,但 7 个 Skill 仍 stub,/chat 是占位壳,12 个 Widget 0 个 React 组件 — **Echora 学习闭环核心价值未交付**。本任务按更新后的 PRD §2.5 + §2.6 + §2.7 实现:

- 场景对话生成机制(LLM 出候选 + 系统筛 + 用户选定后生成完整双语对话 JSON)
- 4 阶段练习首版(MVP 只做阶段 1 填空 + 阶段 2 整句翻译,阶段 3/4 留 004)
- migration 0002 加载 `scene_dialogues` / `scene_history` 两新表 + 5 个 ALTER 字段
- POST /api/chat/send body 增可选 `action` 字段,与 text 二选一(PRD §2.3 结构化菜单动作优先)
- Chat 视图首版替换占位 + 3 个核心 widget React 组件(scene-cards / exercise-card / grading-result)
- 严格按 PRD §5.1 功能验收 + §5.2 负样本验收设计 smoke 覆盖

显式留 004:阶段 3+4 / mastery / error_tags / 难度自适应 / 辅助追问 / review-retry skill;留 005:choice-question / 自动归档 / 会话锁定 / 左右栏 / 移动端响应式。

## 执行摘要

### migration + 共享契约 (commit 1)
- `migrations/0002_learning_loop.sql` — 新表 `scene_dialogues` / `scene_history` + 5 ALTER ADD COLUMN(messages.branch_thread_id, branch_threads.user_id/status, exercise_attempts.scene_id/stage/question_no/retry_count, mastery_records.difficulty_score)
- `shared/api.ts` — 新增 `ChatAction` 联合(5 种 action)、`ChatSendReq` 增 `action` 字段、`SceneDialogueDTO` / `SceneDialogueTurn`
- `shared/errors.ts` — 新增 `SCENE_NOT_FOUND` / `NOT_FOUND` 错误码

### 服务层 (commit 2)
- `server/services/sceneDialogue.ts` — `createSceneDialogue` / `getActiveSceneDialogue`(JSON 字段安全 parse)
- `server/services/sceneHistory.ts` — `appendSceneHistory`(单事务 prune max 10)/ `listSceneHistory`
- `server/services/exerciseAttempt.ts` — `createAttempt` / `getAttempt` / `findLatestAttempt` / `markSubmitted` / `markGraded` / `incrementRetry` / `markNeedsReview` / `countStagePassed` / `maxQuestionNo`
- `server/services/gradingResult.ts` — `createGrading`(UPSERT 重批改覆盖)/ `getGradingByAttempt`,`GradingCorrections` 接口
- `server/__tests__/learning-services.test.ts` — 12 service 单测全过

### scene-select 真实化 (commit 3)
- `server/skills/_helpers/sceneSelectFsm.ts` — `runScenePropose`(20 候选)/ `selectTopK`(去重 + 难度优先排序)/ `runDialogueGeneration`(LLM tool_use 生成完整对话);`proposeScenesTool` + `generateDialogueTool` JSON Schema
- `server/skills/sceneSelect.ts` — 真实实现,两分支:
  - `action=select-scene` → 生成 dialogue + 落库 + appendSceneHistory + state-transition('practicing')
  - 默认 / `action=request-new-scenes` → 候选 widget scene-cards
- `server/routes/chat.ts` — sendSchema 加 `action` zod discriminatedUnion,二选一 refine;action 注入 `decision.params.action`
- 新读端点 `GET /api/chat/conversations/:id/scene-dialogue`
- `server/__tests__/skill-sceneSelect.test.ts` — 5 测试覆盖 4 路径 + 2 失败

### practice 阶段 1+2 真实化 (commit 4)
- `server/skills/_helpers/practiceFsm.ts` — `decideNextQuestion`(基于 countStagePassed 推进)/ `buildQuestionFromTurn`(阶段 1 挖词填空 / 阶段 2 中→英翻译)/ `STAGE_GOAL=2` / `MAX_STAGE_MVP=2`
- `server/skills/practice.ts` — 真实实现:无 scene → error / stage > MAX → state-transition('awaiting_next') / 否则出题 + 落 attempt + widget exercise-card
- `server/__tests__/skill-practice.test.ts` — 5 测试

### grade 真实化 + 删兼容分支 (commit 5)
- `server/skills/_helpers/gradeFsm.ts` — `gradeAnswerTool` JSON Schema(12 类错误标签 enum)+ `buildGradePrompt` + `runGrading`
- `server/skills/grade.ts` — 真实实现:lock 检查 / markSubmitted / runGrading / createGrading(UPSERT)/ markGraded / 错答 incrementRetry + 达 2 次 markNeedsReview / 对答完成阶段判断 + state-transition('awaiting_next')
- `server/routes/chat.ts` — **删除 grade skill 硬编码 state-transition 兼容分支**(grade 已自身 yield)
- `server/__tests__/skill-grade.test.ts` — 6 测试

### 前端 Chat 视图 + 3 widget (commit 6)
- `src/api/chat.ts` — `chatApi.getSceneDialogue` 新增;`send` 支持 `action`
- `src/stores/chat.ts` — 抽 `sendInternal`(text / action 共用);新增 `sendAction` action
- `src/components/widgets/widgets.module.css` — 3 widget + fallback 全部样式
- `src/components/widgets/SceneCards.tsx` — 按原型,卡片 click → sendAction(select-scene),底部「换一批」→ sendAction(request-new-scenes),streaming 时禁用
- `src/components/widgets/ExerciseCard.tsx` — 显示阶段/题号/中文上下文/英文挖空/提示
- `src/components/widgets/GradingResult.tsx` — 顶部状态条 + 大字分 + badge + 答案对比 + 解释 + 错误标签 chips + 「下一题」→ sendAction(next-question)
- `src/components/widgets/WidgetRenderer.tsx` — 分发组件(scene-cards/exercise-card/grading-result + FallbackJsonDump)
- `src/views/Chat/{index,MessageList,MessageBubble,WidgetSlot,ChatInput}.tsx` + `index.module.css` — 替换占位为真实实现:
  - mount 时 loadConversations + 选 practicing/scene_selecting 候选会话
  - MessageList 渲染气泡 + 嵌入 WidgetSlot(widget 来源:activeWidgets 优先,widget_snapshot 兜底)
  - ChatInput 三 mode 联动:chat→sendMessage / fill→sendAction(submit-answer,从 activeWidgets 找最新 attemptId)/ select→隐藏输入提示用 widget
- `src/__tests__/components/widgets/widgets.test.tsx` — 7 widget render + 交互测试

### smoke + 文档 (commit 7)
- `tests/smoke/run-smoke-learning.ts` — 10 场景全过(A 完整闭环 / B 候选过滤 / C 历史 prune / D 答错 retry / E 二次错 needs_review / F state_not_allowed / G ATTEMPT_LOCKED / H text+action 互斥 / I provider 错 / J 阶段推进)
- `package.json` — 新增 `test:smoke:learning` 脚本;`npm test` 全量含此
- `doc/task/003-learning-loop-mvp.md` — 本文(5 段)
- `doc/task/003-test.py` — 交互式手工测试
- `doc/knowledge/{architecture,skills,state-machine,api-contract}.md` — 同步 003 改动
- `CLAUDE.md` — Common Commands 加入 test:smoke:learning

### 验证结果

| 命令 | 结果 |
|---|---|
| `npx tsc -p tsconfig.server.json --noEmit` | ✓ 后端类型干净 |
| `npx tsc -p tsconfig.json --noEmit` | ✓ 前端类型干净 |
| `npm run migrate` | ✓ 应用 0002 |
| `npm run test:server` | ✓ 49 passed (10 suites)— 含 service 12 / sceneSelect 5 / practice 5 / grade 6 新增 28 |
| `npm run test:web` | ✓ 24 passed (5 suites)— 含 widget 7 新增 |
| `npm run test:smoke` | ✓ 6/6 stub 全链 |
| `npm run test:smoke:onboarding` | ✓ 10/10 |
| `npm run test:smoke:learning` | ✓ **10/10**(确定性 mock,完整闭环 + 异常分支) |
| `npm test` | ✓ 全量(server + web + 3 smoke) |

## 手工测试

> 命令块均为可直接复制粘贴的形式(不含 `$` `>` 等 shell 提示符)。
> 占位符:`<TOKEN>` `<CONV_ID>` `<ATTEMPT_ID>` `<STREAM_ID>`。
> **一键复测**:`python doc/task/003-test.py` — 交互式跑完全链,自动占位替换,按空格继续。

### test:smoke:learning · 学习闭环确定性 E2E

命令:

```bash
npm run test:smoke:learning
```

输出(实测):

```
[smoke:learn] === 10 scenarios ===

[smoke:learn] ✓ A 完整闭环(scene → 阶段 1*2 → 阶段 2*2 → awaiting_next) (1050ms)
[smoke:learn] ✓ B 换一批 candidates 过滤已用 topic (162ms)
[smoke:learn] ✓ C scene_history 累计 10 后第 11 次自动 prune (157ms)
[smoke:learn] ✓ D 答错 → retry_count=1 + 无 state-transition (334ms)
[smoke:learn] ✓ E 同题答错 2 次 → markNeedsReview (429ms)
[smoke:learn] ✓ F grading 态调 scene-select → router state_not_allowed (502) (72ms)
[smoke:learn] ✓ G 重复提交同 attempt(已标 needs_review 后) → ATTEMPT_LOCKED (500ms)
[smoke:learn] ✓ H /send 同时传 text + action → 400 VALIDATION_FAILED (70ms)
[smoke:learn] ✓ I provider chat 抛错 → SkillEvent error 直传客户端 (159ms)
[smoke:learn] ✓ J 阶段 1 两题全过后下题为阶段 2(mode=chat) (597ms)

[smoke:learn] PASSED 10 / 10
```

覆盖 PRD §5.1 + §5.2 11 条验收点中的 8 条:完整功能验收 / 场景去重 / 4 阶段推进 / retry 边界 / state_not_allowed / 重复提交 / 真实 provider 失败显式报错。

剩余 3 条(辅助追问主线不变 / 锁定历史详情 / SSE 断线快照恢复)留 004 任务覆盖。

### 后端 API curl 串联(可选,手工)

完整链路 13 步,推荐用 `python doc/task/003-test.py` 一键跑。如需逐步:

```bash
npm run dev
```

#### Step 1 · register + onboarding 完成(用 PUT profile 跳过)

```bash
curl -s -X POST http://127.0.0.1:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"learn@test.dev","password":"echora-pwd-12345"}'
```

```bash
curl -s -X PUT http://127.0.0.1:8787/api/profile \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"学习者","level":"B1"}'
```

#### Step 2 · 新建 scene_selecting 会话

```bash
curl -s -X POST http://127.0.0.1:8787/api/chat/conversations \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"learningState":"scene_selecting"}'
```

#### Step 3 · /send 触发 scene-select 出候选

```bash
curl -s -X POST http://127.0.0.1:8787/api/chat/send \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"conversationId":<CONV_ID>,"text":"看看场景"}'
```

```bash
curl -N "http://127.0.0.1:8787/api/chat/stream?streamId=<STREAM_ID>&lastSeq=0&token=<TOKEN>"
```

期望:看到 `widget-init` + `widget-ready`(scene-cards data.cards 含 3-5 张候选)+ `done`。

#### Step 4 · 选场景 → 生成 dialogue + 转 practicing

```bash
curl -s -X POST http://127.0.0.1:8787/api/chat/send \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"conversationId":<CONV_ID>,"action":{"type":"select-scene","payload":{"sceneId":"<SCENE_ID>"}}}'
```

期望 SSE:text-chunk("正在准备...")+ state-transition(practicing)+ done。

#### Step 5 · 取场景对话(可选检查)

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:8787/api/chat/conversations/<CONV_ID>/scene-dialogue
```

#### Step 6 · 出题 → 答题 → 批改

```bash
curl -s -X POST http://127.0.0.1:8787/api/chat/send \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"conversationId":<CONV_ID>,"text":"出题"}'
```

记录 `widget-ready.data.attemptId` 作为 `<ATTEMPT_ID>`。

```bash
curl -s -X POST http://127.0.0.1:8787/api/chat/send \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"conversationId":<CONV_ID>,"action":{"type":"submit-answer","payload":{"attemptId":<ATTEMPT_ID>,"answer":"order"}}}'
```

期望 SSE:widget-ready(grading-result)+ score + isCorrect + explanation。

### 诊断记录

无活动诊断;若要手工诊断 Anthropic / OpenAI 接入,沿用 002 的:

```bash
npx tsx scripts/diag-anthropic.ts
npx tsx scripts/diag-openai.ts
npm run test:smoke:ai
```

### 总结

- 自动化:**70 项**(server 49 + web 24 + smoke 6 + smoke:onboarding 10 + smoke:learning 10)全过
- 手工:`python doc/task/003-test.py` 一键 13 步交互式跑通(stub provider 时阶段 1+2 走完整闭环;真实 provider 走完同时验证 LLM 输出质量)
- PRD §5.1 + §5.2 11 条验收点覆盖 8 条,剩余 3 条留 004
- 已知缺陷:无

## 遗留 TODO

### 后端
- [后端] **practice 阶段 3(对话接龙)+ 阶段 4(角色互换)**:MVP 仅阶段 1+2,后续按 PRD §2.6 实现
- [后端] **mastery_records 写入**:批改后更新 mastery_score / next_review_at / difficulty_score
- [后端] **error_tag_events 写入**:从 corrections.tags 提取并落 error_tag_events 表
- [后端] **难度自适应**:连续 2 场景全过提难,连续 2 场景过半二次重试降难(依赖 mastery)
- [后端] **降难替换题**:retry_count=2 后系统自动出同知识点降难替换题(MVP 直接 markNeedsReview,无替换题)
- [后端] **branch_threads CRUD** + 辅助追问 skill(`explain` 真实化)
- [后端] **review / retry skill 真实化**(依赖 mastery)
- [后端] **scene-select 候选 100 上限**(MVP 简化为 20,LLM cost/延迟优化后再扩)
- [后端] **POST /api/chat/widget-action 独立接口**(可选,目前复用 /send body.action)
- [后端] **自动归档** + **会话锁定**(PRD §3.1)

### 前端
- [前端] **9 widget React 组件待实现**:fill-blank(独立可复用)/ choice-question / progress-summary / answer-review / intent-confirm / learning-menu / account-gate(保存进度版)/ follow-up-source / conversation-lock
- [前端] **Chat 左栏历史会话列表** + 切换会话 UI
- [前端] **Chat 右栏辅助追问面板**(与 branch_threads 一起做)
- [前端] **menu inputMode** 真实实现(浮层菜单,留 005)
- [前端] **移动端响应式**(< 768px 抽屉)
- [前端] **错误重试 / 停止生成按钮**(SSE 流可中断)
- [前端] **EventSource → fetch + ReadableStream**(消除 ?token= URL 泄露,生产前必做)

### 测试
- [测试] **branch_threads / scene_history 边界 unit test**(append/prune 已覆盖)
- [测试] **practice + grade 在 4 阶段全跑通的端到端**(阶段 3+4 实现后补)
- [测试] **state_not_allowed 在多种 state 组合下的矩阵**(目前只测了 grading × scene-select)

### 文档
- [文档] **PRD §2.6 单题最大重试解读**:是「重试 2 次=共 3 次」还是「最多 2 次=共 2 次」?MVP 实现按「retry_count=2 时锁定 = 共 2 次」,需 PRD 校准
- [文档] **scene_dialogues 持久化策略**:换场景时旧 dialogue 保留(MVP 简化),长期是否需要 archive/cleanup

## 下一阶段建议

1. **闭环质量提升(004)**(PRD §2.6 + §2.7):
   - mastery_records 写入 + 难度自适应
   - error_tag_events 落库 + 错误统计读端点(`GET /api/mastery`)
   - 降难替换题(单题 2 次未通过自动替换)
   - **价值**:让"自适应难度"与"闭环更新"两个 PRD 核心机制真实工作。

2. **辅助追问支线(004,与上并行)**(PRD §3.2):
   - branch_threads CRUD service + route
   - explain skill 真实化(基于 source_ref 解释)
   - 前端 Chat 右栏 + follow-up-source widget
   - **价值**:Echora 区别于普通 chat 的关键体验,主流稳定后接入风险低。

3. **练习阶段 3+4(005)**(PRD §2.6):
   - 阶段 3 对话接龙(chat 模式,逐句推进)
   - 阶段 4 角色互换(用户主动发起,AI 反向扮演)
   - **价值**:完成 PRD §2.6 4 阶段全量,场景练习深度提升。

4. **会话锁定与防抄袭(005)**(PRD §3.1):
   - practicing/grading 期间历史会话答案/参考/批改详情服务层隐藏
   - awaiting_next/reviewing 恢复
   - conversation-lock widget 提示
   - **价值**:学习严肃性,避免翻看旧答案。

5. **12 widget 批量实现(005)**(PRD §4.7):
   - 按优先级补 fill-blank(独立)/ progress-summary / intent-confirm / learning-menu / answer-review / account-gate
   - 配 menu inputMode 浮层菜单
   - **价值**:对话界面体验完整化。
