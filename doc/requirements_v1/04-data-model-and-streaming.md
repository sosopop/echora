# 04. 数据模型与流式记录

## 1. 核心设计

V1 MVP 的数据模型围绕五类实体展开：**用户画像**、**对话会话**、**结构化消息流**、**Widget 快照**、**轻量学习索引**。

`messages` 仍然是主学习流的完整回放来源；但复盘、重练、薄弱点统计、防抄袭不再从自然语言消息或 Widget 文案中临时解析，而是读取 `exercise_attempts`、`grading_results`、`error_tag_events` 三张轻量索引表。

## 2. 用户 (User)

```json
{
  "userId": "user_001",
  "email": "xiaoming@example.com",
  "passwordHash": "$2b$...",
  "createdAt": "2026-05-15T10:00:00Z"
}
```

## 3. 用户画像 (UserProfile)

```json
{
  "userId": "user_001",
  "name": "小明",
  "age": 15,
  "gender": "male",
  "grade": "初三",
  "englishLevel": "A2",
  "difficultyScore": 320,
  "levelEvidence": "中考模拟英语 100/120，语法比较弱",
  "learningGoal": "中考 + 日常交流",
  "weaknessTags": [
    { "tag": "preposition", "count": 12, "severity": "medium" },
    { "tag": "auxiliary_verb", "count": 8, "severity": "high" }
  ],
  "strengthTags": ["vocabulary", "word_order"],
  "totalExercisesCompleted": 45,
  "scenarioPreferences": ["daily_english", "campus_english"],
  "recentSceneTopics": [
    "餐厅点餐", "校园对话", "旅行问路"
  ],
  "createdAt": "2026-05-15T10:00:00Z",
  "updatedAt": "2026-05-15T11:30:00Z"
}
```

UserProfile 对用户不可见。用户通过对话自然语言查询自己的状态。

## 4. 对话会话 (Conversation)

```json
{
  "conversationId": "conv_001",
  "userId": "user_001",
  "title": "餐厅点餐练习",
  "status": "active",
  "learningState": "practicing",
  "activeSkill": "practice",
  "inputMode": "chat",
  "currentExerciseAttemptId": "attempt_001",
  "lockPolicy": "hide_answers_during_active_exercise",
  "lastSummary": "餐厅点餐 · 冠词和礼貌表达待加强",
  "lastBranchThreadId": "branch_001",
  "createdAt": "2026-05-15T10:00:00Z",
  "updatedAt": "2026-05-15T10:30:00Z"
}
```

- 每个用户最多 1 个 `active` 会话
- `learningState` 使用 `08-ai-workflow-and-widget-contract.md` 定义的状态机：`onboarding`、`scene_selecting`、`practicing`、`grading`、`awaiting_next`、`reviewing`、`archived`
- `activeSkill` 只用于恢复当前正在输出或等待的能力，不作为业务状态机的唯一来源
- `inputMode` 记录当前交互区状态，用于刷新恢复
- `lockPolicy` 控制练习中历史答案、参考答案、批改结果的显示策略
- 用户通过学习菜单新建学习流时，将当前会话归档（`status: "archived"`），创建新会话；练习进行中需确认或延后到复盘后执行

### 4.1 辅助追问线程 (BranchThread)

```json
{
  "branchThreadId": "branch_001",
  "conversationId": "conv_001",
  "sourceMessageId": "msg_042",
  "sourceType": "grading-result",
  "sourceSkill": "grade",
  "sourceRef": {
    "type": "grading",
    "exerciseAttemptId": "attempt_001",
    "gradingResultId": "grade_001",
    "errorTags": ["politeness", "article"]
  },
  "status": "open",
  "createdAt": "2026-05-15T10:18:00Z",
  "updatedAt": "2026-05-15T10:24:00Z"
}
```

辅助追问线程只保存源上下文和线程元信息；具体消息仍写入 `messages`，通过 `branchThreadId` 关联。前端用户看到的是"来自：这道题 / 这次批改 / 复盘摘要"，不展示 threadId、messageId 或 sourceId。

`sourceRef.type` 只能取：`message`、`exercise`、`grading`、`widget`、`tag`。辅助追问默认不写入薄弱点统计；只有用户明确选择"加入复盘"或系统识别为正式学习事件时，才写入 `error_tag_events`。

## 5. 消息 (Message)

### 5.1 基结构

```json
{
  "messageId": "msg_001",
  "conversationId": "conv_001",
  "type": "ai-widget",
  "role": "ai",
  "skillName": "scene-select",
  "content": {},
  "widgetSnapshot": null,
  "streamEvents": [],
  "quickActions": [],
  "branchThreadId": null,
  "sourceMessageId": null,
  "createdAt": "2026-05-15T10:05:00Z"
}
```

### 5.2 消息类型定义

| 类型 | 说明 |
|------|------|
| `system` | 系统通知，如登录、会话切换、保存成功、历史受限提示 |
| `user-message` | 用户自然语言输入 |
| `user-answer` | 用户正式答题记录，必须关联 `exerciseAttemptId` |
| `ai-text` | AI 纯文本回复，支持流式渲染 |
| `ai-widget` | AI 或系统消息中嵌入 Widget |
| `branch-message` | 右侧辅助追问消息，必须带 `branchThreadId` 和 `sourceRef` |
| `divider` | 时间分隔符 |

### 5.3 user-answer 示例

```json
{
  "type": "user-answer",
  "role": "user",
  "content": {
    "exerciseAttemptId": "attempt_001",
    "exerciseId": "ex_001",
    "questionType": "full_translation",
    "answer": "I want a medium steak with fries and salad.",
    "submittedAt": "2026-05-15T10:06:00Z"
  }
}
```

### 5.4 ai-widget 示例

```json
{
  "type": "ai-widget",
  "role": "ai",
  "skillName": "grade",
  "content": {
    "text": null
  },
  "widgetSnapshot": {
    "widgetId": "widget_grade_001",
    "widgetType": "grading-result",
    "widgetData": {
      "exerciseAttemptId": "attempt_001",
      "gradingResultId": "grade_001",
      "isCorrect": false,
      "score": 85,
      "userAnswer": "I want a medium steak with fries and salad.",
      "referenceAnswer": "I'd like a medium steak with fries and a salad.",
      "errorTags": ["politeness", "article"],
      "encouragementZh": "意思完全正确！两个小细节让表达更地道。"
    },
    "widgetState": { "expandedCorrectionId": null },
    "actions": [
      {
        "label": "为什么 want 不够礼貌？",
        "action": "open_follow_up",
        "payload": { "sourceRef": { "type": "grading", "gradingResultId": "grade_001" } },
        "affectsMainFlow": false
      },
      {
        "label": "再来一道类似的",
        "action": "retry_similar",
        "payload": { "errorTags": ["politeness", "article"] },
        "affectsMainFlow": true
      }
    ],
    "status": "ready",
    "sourceRef": {
      "type": "grading",
      "exerciseAttemptId": "attempt_001",
      "gradingResultId": "grade_001"
    },
    "createdBySkill": "grade"
  }
}
```

## 6. Widget 快照

Widget 是对话流中的功能承载层。每个 Widget 必须以统一快照格式落库，便于刷新恢复、权限控制、历史回放和回归测试。

```ts
interface LearningWidget {
  widgetId: string;
  widgetType: WidgetType;
  widgetData: Record<string, unknown>;
  widgetState: Record<string, unknown>;
  actions: WidgetAction[];
  status: 'loading' | 'ready' | 'disabled' | 'submitted' | 'expired' | 'error';
  sourceRef?: SourceRef;
  createdBySkill: string | 'system';
}
```

V1 Widget 类型以 `08-ai-workflow-and-widget-contract.md` 为准：`scene-cards`、`exercise-card`、`fill-blank`、`choice-question`、`grading-result`、`progress-summary`、`answer-review`、`intent-confirm`、`learning-menu`、`account-gate`、`follow-up-source`、`conversation-lock`。

Widget 的 action 不直接改库。前端点击后发送结构化动作给系统，系统校验当前 `learningState`、会话锁定、权限和 action schema 后再决定是否进入 AI 调度或执行确定性动作。

## 7. 结构化学习索引

### 7.1 exercise_attempts

记录一次正式题目生成与用户作答，不负责展示完整消息。

```json
{
  "exerciseAttemptId": "attempt_001",
  "conversationId": "conv_001",
  "userId": "user_001",
  "sceneTitle": "餐厅点餐",
  "skillName": "practice",
  "questionType": "full_translation",
  "promptZh": "我想要一份五分熟的牛排，配薯条和一份沙拉。",
  "referenceAnswers": [
    "I'd like a medium steak with fries and a salad."
  ],
  "userAnswer": "I want a medium steak with fries and salad.",
  "status": "submitted",
  "createdAt": "2026-05-15T10:05:00Z",
  "submittedAt": "2026-05-15T10:06:00Z"
}
```

### 7.2 grading_results

记录批改结果，供复盘、重练和答案隐藏策略使用。

```json
{
  "gradingResultId": "grade_001",
  "exerciseAttemptId": "attempt_001",
  "conversationId": "conv_001",
  "score": 85,
  "isCorrect": false,
  "summaryZh": "意思正确，但点餐表达可以更礼貌，salad 前需要冠词。",
  "corrections": [
    {
      "original": "I want",
      "corrected": "I'd like",
      "reasonZh": "点餐时 I'd like 比 I want 更礼貌",
      "errorTag": "politeness"
    }
  ],
  "createdAt": "2026-05-15T10:06:30Z"
}
```

### 7.3 error_tag_events

记录可统计的错误标签事件。该表是薄弱点、重练和 difficulty 调整的主要来源。

```json
{
  "errorTagEventId": "tag_evt_001",
  "userId": "user_001",
  "conversationId": "conv_001",
  "exerciseAttemptId": "attempt_001",
  "gradingResultId": "grade_001",
  "tag": "article",
  "severity": "medium",
  "source": "grading",
  "includedInStats": true,
  "createdAt": "2026-05-15T10:06:35Z"
}
```

## 8. 流式记录

### 8.1 流事件结构

每条 AI 消息的生成过程记录为一组流事件。前端通过消费这些事件逐步渲染消息内容。

```json
{
  "messageId": "msg_010",
  "streamEvents": [
    { "seq": 1, "type": "text-chunk", "data": "你好小明！" },
    { "seq": 2, "type": "text-chunk", "data": "根据你的情况，" },
    { "seq": 3, "type": "widget-init", "widgetType": "scene-cards" },
    { "seq": 4, "type": "widget-update", "field": "scenes[0]", "data": { "titleZh": "餐厅点餐" } },
    { "seq": 5, "type": "widget-ready" },
    { "seq": 6, "type": "mode-switch", "mode": "select" },
    { "seq": 7, "type": "done" }
  ]
}
```

### 8.2 流事件类型总览

| 事件类型 | 说明 | 携带数据 |
|----------|------|----------|
| `text-chunk` | 文本增量 | `data: string` |
| `widget-init` | 初始化 Widget 容器 | `widgetType: WidgetType` |
| `widget-update` | 更新 Widget 字段 | `field: string`, `data: unknown` |
| `widget-ready` | Widget 可交互 | - |
| `mode-switch` | 切换输入模式 | `mode: InputMode` |
| `quick-actions` | 设置快捷按钮 | `actions: WidgetAction[]` |
| `error` | 生成出错 | `message: string` |
| `done` | 本消息完成 | - |

### 8.3 内部流式传输

底层可以使用 SSE / EventSource 传输 SkillEvent，但这是内部协议。前端用户界面不得显示 "SSE"、事件名、序号或 JSON；只显示"Echo 正在生成"、"正在准备互动卡片"、"正在恢复连接"等自然状态。

### 8.4 持久化策略

- 流事件实时追加写入数据库
- 客户端断线重连后，从最后收到的事件 seq 继续
- 消息完成后，`content` 和 `widgetSnapshot` 存储完整快照（用于快速恢复），`streamEvents` 保留用于回放和调试

## 9. 数据库表

| 表 | 说明 | 关键字段 |
|----|------|----------|
| `users` | 账号 | email, password_hash |
| `user_profiles` | 用户画像 | name, age, grade, level, difficulty_score, weakness_tags(JSON), recent_topics(JSON) |
| `conversations` | 对话会话 | user_id, status(active/archived), learning_state, active_skill, input_mode, lock_policy, current_exercise_attempt_id, last_summary |
| `messages` | 消息记录 | conversation_id, type, role, skill_name, content(JSON), widget_snapshot(JSON), stream_events(JSON), quick_actions(JSON), branch_thread_id, source_message_id |
| `branch_threads` | 辅助追问线程 | conversation_id, source_message_id, source_type, source_ref(JSON), status |
| `exercise_attempts` | 正式题目与作答索引 | user_id, conversation_id, question_type, prompt, reference_answers(JSON), user_answer, status |
| `grading_results` | 批改结果索引 | exercise_attempt_id, score, is_correct, summary, corrections(JSON) |
| `error_tag_events` | 错误标签事件 | user_id, exercise_attempt_id, grading_result_id, tag, severity, source, included_in_stats |

V1 仍不做完整的传统学习页面表模型或独立测评流程表。复盘、重练和薄弱点统计由轻量学习索引生成；主学习体验仍由 `messages` 和 Widget 快照完整恢复。

## 10. Skill 注册表（运行时）

Skill 本身不存储在数据库中。Skill 注册表是运行时内存结构：

```ts
const skillRegistry = new Map<string, Skill>();

export function registerSkill(skill: Skill) {
  skillRegistry.set(skill.name, skill);
}

export function getSkill(name: string): Skill | undefined {
  return skillRegistry.get(name);
}

export function getSkillDescriptions(): string {
  return Array.from(skillRegistry.values())
    .map(s => `- ${s.name}: ${s.description}`)
    .join('\n');
}
```

新增 Skill 需要声明 `allowedStates`、可输出的 Widget 类型和可能的 `nextStates`，由系统状态机统一校验。
