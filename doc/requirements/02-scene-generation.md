# 02. 场景生成与结构化内容

## 1. 场景主题生成机制

### 1.1 基本规则

每次开始新练习时，系统调用 AI 生成 100 个候选场景主题。场景主题生成支持三种入口：

1. 用户选择场景类别，并可通过阈值控制约束强度。
2. 用户不进行场景约束，由 AI 在当前难度下随机生成。
3. 用户输入自定义场景描述，由 AI 规范化后生成。

无论入口是哪一种，最终都必须由 AI 处理为标准候选主题，再进入随机选择、场景对话生成和练习题生成流程。

AI 生成时需要输入：

```json
{
  "userLevel": "B1",
  "difficultyScore": 420,
  "generationMode": "category_constrained",
  "scenarioCategories": ["restaurant_english"],
  "categoryMatchThreshold": 0.7,
  "customScenarioText": null,
  "recentSceneTopics": [
    "ordering food at a restaurant",
    "asking for help at a train station"
  ],
  "weaknessTags": ["preposition", "word_order"],
  "count": 100
}
```

如果用户不进行场景约束：

```json
{
  "userLevel": "B1",
  "difficultyScore": 420,
  "generationMode": "open_random",
  "scenarioCategories": [],
  "categoryMatchThreshold": 0,
  "customScenarioText": null,
  "recentSceneTopics": [],
  "weaknessTags": ["preposition", "word_order"],
  "count": 100
}
```

如果用户自定义场景：

```json
{
  "userLevel": "B1",
  "difficultyScore": 420,
  "generationMode": "custom_scenario",
  "scenarioCategories": [],
  "categoryMatchThreshold": null,
  "customScenarioText": "我想练习在酒店前台要求换一间安静一点的房间。",
  "recentSceneTopics": [],
  "weaknessTags": ["polite_request"],
  "count": 100
}
```

AI 输出 100 个候选主题，例如：

```json
{
  "themes": [
    {
      "themeId": "theme_001",
      "titleEn": "Returning a damaged product at a store",
      "titleZh": "在商店退换损坏商品",
      "category": "shopping_english",
      "categoryMatchScore": 0.92,
      "sourceMode": "category_constrained",
      "estimatedLevel": "B1",
      "targetExpressions": [
        "I would like to return this.",
        "It was damaged when I opened it."
      ],
      "weaknessTags": ["polite_request", "past_tense"]
    }
  ]
}
```

### 1.2 随机选择规则

系统从 100 个主题中随机选择 1 个作为本次练习主题。随机时可以做基础过滤：

1. 必须符合当前用户等级。
2. 如果是 `category_constrained` 模式，必须满足 `categoryMatchThreshold`。
3. 如果是 `open_random` 模式，不做场景类别过滤，但仍要保证主题真实、自然、多样。
4. 如果是 `custom_scenario` 模式，必须与用户自定义意图一致，但可以由 AI 补足角色、地点和表达目标。
5. 不允许与最近 10 个主题标题完全相同。
6. 不允许 AI 明确标记为与最近主题重复。
7. V1 不做语义相似度判断。

### 1.3 场景生成模式

| 模式 | 输入 | AI 处理 | 输出要求 |
|---|---|---|---|
| `category_constrained` | `scenarioCategories`、`categoryMatchThreshold` | 按类别和阈值生成候选主题 | 主题包含 `category` 和 `categoryMatchScore` |
| `open_random` | 无场景类别约束 | 根据等级、薄弱点、最近主题随机生成 | 主题仍需有系统判断出的 `category` |
| `custom_scenario` | `customScenarioText` | 先规范化用户输入，再扩展候选主题 | 主题必须保留用户意图并结构化 |

### 1.4 类别阈值规则

`categoryMatchThreshold` 用于控制候选主题与所选类别的贴合度：

1. 默认值为 `0.7`。
2. 阈值为 `1.0` 时，主题必须明确属于用户选择的类别。
3. 阈值为 `0.4-0.7` 时，允许相邻场景进入候选池。
4. 阈值为 `0` 或 `generationMode` 为 `open_random` 时，不进行类别约束。
5. AI 必须为每个候选主题输出 `categoryMatchScore`，后端根据阈值过滤。

### 1.5 自定义场景处理规则

用户输入自定义场景后，系统必须交给 AI 进行规范化处理，不能直接拼接成最终场景。

AI 需要完成：

1. 提取用户意图。
2. 判断或补全场景类别。
3. 生成英文标题和中文标题。
4. 识别角色、地点、语气和表达目标。
5. 根据当前 CEFR 难度重写为合适的练习主题。
6. 输出候选主题列表，后续仍走统一随机选择和结构化生成流程。

### 1.6 最近场景队列

每个用户维护一个最近场景队列，最大长度为 10。

```json
{
  "recentSceneTopics": [
    {
      "sceneId": "scene_10001",
      "titleEn": "Returning a damaged product at a store",
      "titleZh": "在商店退换损坏商品",
      "createdAt": "2026-05-13T10:30:00Z"
    }
  ]
}
```

规则：

1. 每完成一次场景生成，将主题写入队列。
2. 队列最大长度为 10。
3. 超过 10 条时，移除最早的一条。
4. 下次 AI 生成 100 个主题时，将这 10 个主题传入排除列表。
5. 提示 AI 不要生成与这些主题相同或明显相关的场景。

## 2. 场景对话生成设计

### 2.1 场景内容组成

每个场景应包含：

| 内容 | 说明 |
|---|---|
| 场景主题 | 英文标题 + 中文标题 |
| 场景说明 | 简短说明当前情景 |
| 角色设定 | 至少两个角色 |
| 英汉双语对话 | 逐句结构化 |
| 重点词汇 | 5-10 个 |
| 重点句型 | 3-5 个 |
| 难点说明 | 根据用户等级生成 |
| 练习题数据 | 三阶段汉译英 |
| 知识点标签 | 语法、词汇、表达标签 |

### 2.2 场景 JSON 结构

```json
{
  "sceneId": "scene_10001",
  "theme": {
    "titleEn": "Returning a damaged product at a store",
    "titleZh": "在商店退换损坏商品",
    "category": "shopping_english",
    "sourceMode": "category_constrained",
    "categoryMatchScore": 0.92,
    "level": "B1",
    "difficultyScore": 420
  },
  "scenario": {
    "descriptionEn": "A customer returns a damaged product and asks for a refund.",
    "descriptionZh": "一位顾客退换损坏的商品，并要求退款。",
    "location": "electronics store",
    "roles": [
      {
        "roleId": "customer",
        "nameEn": "Customer",
        "nameZh": "顾客"
      },
      {
        "roleId": "clerk",
        "nameEn": "Clerk",
        "nameZh": "店员"
      }
    ]
  },
  "dialogues": [
    {
      "lineId": "line_001",
      "speaker": "customer",
      "textEn": "Hi, I would like to return this charger because it does not work.",
      "textZh": "你好，我想退掉这个充电器，因为它不能用。",
      "literalZh": "你好，我想要退回这个充电器，因为它不工作。",
      "naturalZh": "你好，我想退掉这个充电器，因为它不能用。",
      "difficultyTags": ["polite_request", "because_clause"],
      "grammarTags": ["would_like_to", "simple_present"],
      "vocabularyTags": ["return", "charger", "work"],
      "keyPhrases": [
        {
          "phraseEn": "I would like to return...",
          "phraseZh": "我想退掉……"
        }
      ]
    }
  ],
  "vocabulary": [
    {
      "word": "return",
      "meaningZh": "退回，退货",
      "exampleEn": "I would like to return this item.",
      "exampleZh": "我想退掉这个商品。"
    }
  ],
  "sentencePatterns": [
    {
      "pattern": "I would like to + verb...",
      "meaningZh": "我想要……",
      "exampleEn": "I would like to return this charger.",
      "exampleZh": "我想退掉这个充电器。"
    }
  ],
  "commonMistakes": [
    {
      "mistake": "I want return this charger.",
      "correction": "I want to return this charger.",
      "explanationZh": "want 后面接动词不定式 to do。"
    }
  ]
}
```

## 3. 练习题 JSON 结构

```json
{
  "exerciseSetId": "exercise_set_10001",
  "sceneId": "scene_10001",
  "mode": "zh_to_en_iterative",
  "stages": [
    {
      "stage": 1,
      "name": "single_blank",
      "description": "每句隐藏一个空",
      "questions": [
        {
          "questionId": "q_001_1",
          "lineId": "line_001",
          "promptZh": "你好，我想退掉这个充电器，因为它不能用。",
          "questionText": "Hi, I would like to ______ this charger because it does not work.",
          "answer": "return",
          "acceptableAnswers": ["return"],
          "blankType": "word",
          "targetTags": ["vocabulary", "return"]
        }
      ]
    },
    {
      "stage": 2,
      "name": "half_blank",
      "description": "每句隐藏一半空",
      "questions": [
        {
          "questionId": "q_001_2",
          "lineId": "line_001",
          "promptZh": "你好，我想退掉这个充电器，因为它不能用。",
          "questionText": "Hi, I ______ ______ to ______ this charger because it ______ not ______.",
          "answer": "would like / return / does / work",
          "acceptableAnswers": [
            ["would", "like", "return", "does", "work"]
          ],
          "blankType": "multi_word",
          "targetTags": ["sentence_structure", "would_like_to", "simple_present"]
        }
      ]
    },
    {
      "stage": 3,
      "name": "full_translation",
      "description": "整句翻译",
      "questions": [
        {
          "questionId": "q_001_3",
          "lineId": "line_001",
          "promptZh": "你好，我想退掉这个充电器，因为它不能用。",
          "referenceAnswer": "Hi, I would like to return this charger because it does not work.",
          "acceptableAnswers": [
            "Hi, I would like to return this charger because it does not work.",
            "Hello, I’d like to return this charger because it doesn’t work."
          ],
          "targetTags": ["full_sentence_translation", "polite_request", "because_clause"]
        }
      ]
    }
  ]
}
```

## 4. 内容质量要求

1. 对话必须自然，不能像教材硬编。
2. 英文表达应符合当前 CEFR 约束，不能过度炫技。
3. 中文翻译应区分 `literalZh` 和 `naturalZh`，便于讲解中英表达差异。
4. 每句话必须能被追踪到 `lineId`，每道题必须能追踪到 `questionId`。
5. 知识点标签要稳定，后续用于薄弱点分析和推荐生成。
6. 场景内容生成后必须通过 JSON Schema 或 Zod 校验。
7. 对话、词汇、句型、常见错误和练习题之间要保持一致。
