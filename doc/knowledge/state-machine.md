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

练习主线(013):

```
practicing
  → 阶段 1 fill_word(2 题通过)
  → 阶段 2 sentence_translation(2 题通过)
  → 阶段 3 dialogue_chain(2 题通过)
  → 阶段 4 role_reversal(2 题通过)
  → awaiting_next
```

阶段内答错保持 `practicing`;同题第 2 次未通过会标记 `needs_review`,后续通过 `next-question` 继续推进。

复盘主线(015):

```
awaiting_next
  → 用户输入 "复盘" / "总结" / "学习报告" / "review"
  → review skill
  → reviewing + progress-summary
```

`reviewing` 下再次输入复盘类文本会重新生成当前场景的学习报告;输入 `换场景` / `next` / `开始练习` 等继续类文本仍按 chat route 规则进入场景选择。

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

## Pending

- `archived` 转出场景(从 archived 复制为新会话作为模板)的逻辑未定
