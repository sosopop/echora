# Learning State Machine

## 入口

- 类型定义:`shared/skill.ts`(`LearningState` 枚举)
- 服务端转移:`server/services/conversation.ts`(`updateLearningState`)
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

## 约束与失败点

- **`practicing` / `grading` 期间锁定**:历史会话答案/参考/批改详情默认隐藏(防抄袭),由 conversations.lock_policy 控制
- **`awaiting_next` / `reviewing` 解锁**:历史详情恢复
- **`archived` 只读**:不可继续答题,只能复盘或被引用
- **锁定是系统规则**:不由 AI 决定;AI 只能解释为什么暂时不可见
- **前端镜像非真理**:服务端是状态事实源,前端非法转移仅 console.warn,以服务端 push 的最新值为准

## 测试入口

- 转移合法性测试:后续在 `server/__tests__/conversation.test.ts`
- 锁定行为测试:在历史消息接口测试中覆盖

## Pending

- `lock_policy` 字段当前默认 `open`,V1 业务接入后需根据 learning_state 自动切换
- `archived` 转出场景(从 archived 复制为新会话作为模板)的逻辑未定
