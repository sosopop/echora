# Learning State Machine

## 入口

- 类型定义:`shared/skill.ts`(`LearningState` 枚举)
- 服务端转移:`server/services/conversation.ts`(`updateLearningState`,同步更新 `lock_policy`)
- 前端镜像:`src/stores/learningState.ts`(只缓存,不持久化决策)

## 关键源码

7 个学习态(PRD §2.4):

```
onboarding
  → scene_selecting
       → practicing
            → grading
                 → awaiting_next
                      ├─ practicing (新一题)
                      ├─ scene_selecting (换场景)
                      └─ reviewing
                           ├─ practicing (重练)
                           └─ archived
```

002 起,onboarding 在 `name + level` 采集完成后不会只发结束提示,而是会在同一条 assistant 流中直接 `state-transition('scene_selecting')` 并继续接 `scene-select` 的场景推荐结果,避免用户停在“画像已完成但不知道下一步”的空窗里。061 起,onboarding 的必填回答由 `ExpectedInputPolicy` 约束:拒绝昵称会写入临时称呼 `小伙伴` 后继续问 `level`;拒绝或要求 AI 代定英语水平会留在 `onboarding` 并重问,不会兜底猜测或推进状态。

练习主线(013):

```
practicing
  → 阶段 1 fill_word(按场景难度 2-3 题通过)
  → 阶段 2 sentence_translation(按场景难度 1-3 题通过)
  → 阶段 3 dialogue_chain(按场景难度 1-2 题通过)
  → 阶段 4 role_reversal(按场景难度 1-2 题通过)
  → awaiting_next
```

021 起,阶段内答对不再等待用户点击"下一题":`grade` 会在同一条 assistant 流里先返回批改结果,再自动串接下一张 `exercise-card`。阶段 1-3 达标后自动进入下一阶段第一题;阶段 4 达标后才转 `awaiting_next`。045 起阶段题量绑定当前 `scene_dialogues.difficulty`:A1/A2 共 5 题(2/1/1/1),B1/B2 共 8 题(2/2/2/2),C1/C2 共 10 题(3/3/2/2)。043 起,阶段 4 达标到 `awaiting_next` 之间会根据最近 2 个完整场景的表现自动升/降 `user_profiles.level`,并在同一条 assistant 回复里追加难度变化说明。阶段内第 1 次答错保持 `practicing` 并允许改句重交;024 起同题第 2 次未通过会标记 `needs_review`,并立即生成一张同知识点降难替换题,通过替换题后自动回主线下一题。

错题替换主线(024):

```
practicing mainline attempt
  → 第 1 次 incorrect: retry_count=1,留在原题
  → 第 2 次 incorrect: retry_count=2 + needs_review
  → retry(mode=replacement, stage=5, remediationKind=replacement)
  → 替换题通过
  → practice 根据 countStageHandled 继续主线下一题
```

`needs_review` 在主线进度中算作"已处理",但不会算作通过题;替换题使用内部 `stage=5`,只作为当场补救题,不计入专项重练的 3 题额度。

复盘主线(015):

```
awaiting_next
  → 用户输入 "复盘" / "总结" / "学习报告" / "review"
  → review skill
  → reviewing + progress-summary
```

`reviewing` 下再次输入复盘类文本会重新生成当前场景的学习报告;输入 `重练` 仍进入专项重练。025 起,`archived` 会话中只有 `复盘` / `总结` / `学习报告` / `review` 会被允许进入 `review`;继续练习、换场景、提交答案等请求会在 `/api/chat/send` 入口被拒绝,且不会创建用户消息或 assistant 占位消息。046 起,active 会话在 `awaiting_next` / `reviewing` 下收到继续下一轮/换场景请求(`request-new-scenes`)时,会先把原会话归档为 `archived`,再创建新的 `scene_selecting` 会话承接本次请求;下一轮不会继续追加到上一轮复盘会话里。049 起,archived 会话可通过专门派生入口复制最近场景到新 `scene_selecting` 会话,再由前端触发 `next-question` 从同场景重新开始练习。

难度反馈(042):

```
scene_selecting / practicing / awaiting_next / reviewing
  → 用户输入 "太难" / "简单一点" / "too hard" / "easier"
  → profile.level 下调一档
  → scene_selecting + scene-select(request-new-scenes)

scene_selecting / practicing / awaiting_next / reviewing
  → 用户输入 "太简单" / "难一点" / "too easy" / "harder"
  → profile.level 上调一档
  → scene_selecting + scene-select(request-new-scenes)
```

难度反馈在自由文本答案兜底之前判定,因此 `practicing` 中不会把"太难/太简单"误提交为当前题答案。等级最低 A1、最高 C2 时不越界,`difficultyFeedback.changed=false` 时只解释已到边界。

自动难度升降(043):

```
stage 4 complete
  → listRecentCompletedSceneOutcomes(user, 2)
  → 两个完整场景均 firstPass: profile.level 上调一档
  → 两个完整场景均 earlyStruggle: profile.level 下调一档
  → awaiting_next
```

`firstPass` 要求主线 1-4 阶段所有题 `graded + is_correct=1 + retry_count=0`;`earlyStruggle` 要求阶段 1-2 中超过半数题 `retry_count>=2` 或 `needs_review`。045 起完整场景要求每个主线阶段达到该场景难度对应的题量,因此 A1/A2 的 5 题、B1/B2 的 8 题、C1/C2 的 10 题都能正确参与自动调级,半截数据不会误触发。

重练主线(016):

```
reviewing / awaiting_next
  → 用户输入 "重练" / "重练 <tag>"
  → retry skill
  → practicing(activeSkill=retry)
  → stage 5 retry exercise-card(最多 3 题)
  → reviewing
```

`stage=5` 是系统内部用于区分专项重练的练习阶段,不属于 PRD §2.6 的四阶段主线。前端展示为"重练";批改通过时不会触发四阶段 `awaiting_next` 完成判断。`activeSkill=retry` 时,结构化 `next-question` 会继续路由到 `retry`。
021 起,重练第 1/2 题通过后也由 `grade` 自动串接下一道重练题;第 3 题通过后转回 `reviewing`。
024 起,`retry` 也被 `grade` 用作自动降难替换题生成器:`mode='replacement'` 时会生成单道 `stage=5` 题卡,但 `activeSkill` 写回 `practice`,通过后返回四阶段主线。

辅助追问支线(030):

```
任意主学习态
  → 创建 branch_thread(source_message_id + source_ref)
  → 支线 messages(branch_thread_id=thread.id)
  → 主线 learning_state / active_skill / input_mode 不变
```

支线消息复用 `messages` 表,但 `GET /api/chat/conversations/:id/messages` 只返回 `branch_thread_id IS NULL` 的主线消息。支线 API 不发 `state-transition`,不生成下一题,不提交答案,普通支线追问也不写 `error_tag_events` / `mastery_records`。044 起,用户在已批改来源的支线中显式点击“加入复盘”时,后端会幂等补写该批改的缺失错误标签事件并更新对应掌握度,但仍不改变主学习状态。锁定态下支线回复不复述来源消息正文,只能给提示和概念解释。

## 约束与失败点

- **`practicing` / `grading` 期间锁定**:历史会话答案/参考/批改详情默认隐藏(防抄袭),由 `conversations.lock_policy='locked'` 控制;`createConversation` 与 `updateLearningState` 会按学习态自动写入
- **`awaiting_next` / `reviewing` 解锁**:历史详情恢复,`lock_policy='open'`
- **历史消息脱敏**:`GET /api/chat/conversations/:id/messages` 在 locked 状态下只隐藏用户答题消息与 `grading-result`,保留题卡、场景卡、复盘摘要等非答案内容
- **`archived` 只读**:不可继续答题,只能复盘或被引用
- **锁定是系统规则**:不由 AI 决定;AI 只能解释为什么暂时不可见
- **前端镜像非真理**:服务端是状态事实源,前端非法转移仅 console.warn,以服务端 push 的最新值为准

## 测试入口

- 转移合法性测试:后续在 `server/__tests__/conversation.test.ts`
- 复盘状态转移:`server/__tests__/skill-review.test.ts` + `server/__tests__/chat-route.test.ts`
- 重练状态转移:`server/__tests__/skill-retry.test.ts` + `server/__tests__/skill-grade.test.ts` + `server/__tests__/chat-route.test.ts`
- 锁定行为测试:`server/__tests__/chat-route.test.ts`(历史消息脱敏/解锁恢复) + `server/__tests__/learning-services.test.ts`(state → lock_policy)
- 正确后自动下一题:`server/__tests__/skill-grade.test.ts` + `tests/smoke/run-smoke-learning.ts`
- 难度反馈:`server/__tests__/chat-route.test.ts` + `server/__tests__/skill-sceneSelect.test.ts`

## Pending

- archived 派生目前复制最近场景并重新练习,尚未把旧复盘摘要作为显式上下文提示展示在新会话首屏
