# 04. 复盘、薄弱点与数据模型

## 1. 薄弱点分析

### 1.1 错误标签

每次 AI 批改后，应给错误打标签。

| 标签 | 含义 |
|---|---|
| `spelling` | 拼写错误 |
| `word_order` | 语序错误 |
| `tense` | 时态错误 |
| `article` | 冠词错误 |
| `preposition` | 介词错误 |
| `subject_verb_agreement` | 主谓一致 |
| `auxiliary_verb` | 助动词错误 |
| `modal_verb` | 情态动词错误 |
| `infinitive` | 不定式错误 |
| `gerund` | 动名词错误 |
| `collocation` | 搭配错误 |
| `politeness` | 语气不自然 |
| `literal_translation` | 中式直译 |
| `missing_subject` | 缺少主语 |
| `missing_verb` | 缺少谓语 |
| `plural` | 单复数错误 |

### 1.2 薄弱点统计

系统定期统计最近一段时间错误：

```json
{
  "recentPracticeWindow": "last_10_scenes",
  "weaknessSummary": [
    {
      "tag": "word_order",
      "errorCount": 18,
      "severity": "high",
      "examples": ["Can you tell me where is the station?"],
      "suggestionZh": "你经常在宾语从句中使用疑问句语序。"
    },
    {
      "tag": "preposition",
      "errorCount": 12,
      "severity": "medium",
      "examples": ["discuss about the problem"],
      "suggestionZh": "部分动词后面不需要介词。"
    }
  ]
}
```

### 1.3 薄弱点影响后续生成

当用户存在明显薄弱点时，系统生成新场景时加入约束：

```json
{
  "weaknessTags": ["word_order", "preposition"],
  "generationInstruction": "The dialogue should naturally include several sentences that train word order in indirect questions and common preposition usage."
}
```

注意：薄弱点只影响生成内容的侧重点，不能导致场景生硬或为了语法而牺牲真实交流。

## 2. 复盘与重练功能

### 2.1 复盘首页

复盘页面展示：

| 内容 | 说明 |
|---|---|
| 最近练习场景 | 最近完成的场景 |
| 平均分趋势 | 近 7 天、近 30 天 |
| 错题数量 | 按标签统计 |
| 高频错误 | 例如介词、语序、时态 |
| 难度变化 | `difficultyScore` 曲线 |
| 推荐复习内容 | AI 生成复习建议 |

### 2.2 场景复盘

用户可以进入某个历史场景查看：

1. 原始情景对话。
2. 每一道题。
3. 用户答案。
4. AI 批改结果。
5. 错误解析。
6. 当时得分。
7. 可重新练习。

### 2.3 错题重练

错题重练有两种方式：

| 方式 | 说明 |
|---|---|
| 原题重练 | 直接重新做历史错题 |
| 变体重练 | AI 根据原错题生成类似但不完全相同的新题 |

示例：

```text
原错题：
我想退掉这个充电器。
I want return this charger.

变体题：
我想取消这个订单。
I want to cancel this order.
```

### 2.4 AI 复盘总结

系统支持生成阶段性总结：

```text
过去 10 个场景中，你的整体表现稳定在 B1 水平，平均分为 78 分。

主要薄弱点：
1. want / need / would like 后面的 to do 结构掌握不稳定。
2. 一般现在时否定句中，经常漏掉 do / does。
3. 中文直译较多，礼貌表达还不够自然。

建议下一阶段重点练习：
1. would like to / need to / have to
2. do not / does not 的否定结构
3. 商店、餐厅、客服类礼貌表达场景
```

## 3. 数据模型设计

V1 推荐使用 SQLite + SQL migrations 落地。以下模型可映射为关系表，JSON 字段保存结构化快照，便于复盘和后续迁移。

### 3.1 User 用户表

```json
{
  "userId": "user_001",
  "email": "user@example.com",
  "nickname": "Alex",
  "nativeLanguage": "zh-CN",
  "targetLanguage": "en",
  "scenarioCategories": ["daily_english", "business_english"],
  "currentLevel": "B1",
  "difficultyScore": 420,
  "createdAt": "2026-05-13T10:00:00Z",
  "updatedAt": "2026-05-13T10:00:00Z"
}
```

### 3.2 Scene 场景表

```json
{
  "sceneId": "scene_10001",
  "userId": "user_001",
  "titleEn": "Returning a damaged product at a store",
  "titleZh": "在商店退换损坏商品",
  "category": "shopping_english",
  "level": "B1",
  "difficultyScore": 420,
  "sceneJson": {},
  "createdAt": "2026-05-13T10:30:00Z"
}
```

### 3.3 RecentSceneQueue 最近场景队列表

```json
{
  "userId": "user_001",
  "queue": [
    {
      "sceneId": "scene_10001",
      "titleEn": "Returning a damaged product at a store",
      "titleZh": "在商店退换损坏商品",
      "createdAt": "2026-05-13T10:30:00Z"
    }
  ]
}
```

### 3.4 ExerciseRecord 练习记录表

```json
{
  "recordId": "record_001",
  "userId": "user_001",
  "sceneId": "scene_10001",
  "stageScores": {
    "singleBlank": 92,
    "halfBlank": 81,
    "fullTranslation": 74
  },
  "finalScore": 81,
  "difficultyBefore": 420,
  "difficultyAfter": 430,
  "startedAt": "2026-05-13T10:35:00Z",
  "completedAt": "2026-05-13T11:05:00Z"
}
```

### 3.5 AnswerRecord 答题记录表

```json
{
  "answerId": "answer_001",
  "userId": "user_001",
  "sceneId": "scene_10001",
  "questionId": "q_001_3",
  "stage": 3,
  "promptZh": "你好，我想退掉这个充电器，因为它不能用。",
  "userAnswer": "Hi, I want return this charger because it not work.",
  "referenceAnswer": "Hi, I would like to return this charger because it does not work.",
  "score": 82,
  "isCorrect": false,
  "errorTags": ["infinitive", "auxiliary_verb"],
  "aiAnalysis": "你的意思基本正确，但 want 后面需要加 to，否定句 it does not work 不能省略 does。",
  "createdAt": "2026-05-13T10:45:00Z"
}
```

### 3.6 WeaknessProfile 薄弱点表

```json
{
  "userId": "user_001",
  "weaknessTags": [
    {
      "tag": "auxiliary_verb",
      "errorCount": 12,
      "severity": "high",
      "lastOccurredAt": "2026-05-13T10:45:00Z"
    }
  ],
  "updatedAt": "2026-05-13T11:00:00Z"
}
```

### 3.7 PracticeSession 练习会话表

用于支持练习中断恢复。

```json
{
  "practiceSessionId": "session_001",
  "userId": "user_001",
  "sceneId": "scene_10001",
  "exerciseSetId": "exercise_set_10001",
  "status": "in_progress",
  "currentStage": 2,
  "currentQuestionIndex": 5,
  "stageProgress": {
    "stage1": "completed",
    "stage2": "in_progress",
    "stage3": "not_started"
  },
  "createdAt": "2026-05-13T10:30:00Z",
  "updatedAt": "2026-05-13T10:50:00Z"
}
```

### 3.8 ChatThread 辅助解析线程表

用于保存用户针对句子、题目、语法点的连续追问。

```json
{
  "threadId": "thread_001",
  "userId": "user_001",
  "sceneId": "scene_10001",
  "sourceType": "question",
  "sourceId": "q_001_3",
  "contextJson": {},
  "messages": [],
  "createdAt": "2026-05-13T10:45:00Z",
  "updatedAt": "2026-05-13T10:52:00Z"
}
```
