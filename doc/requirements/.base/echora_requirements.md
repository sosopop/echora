# Echora 在线英语情景练习网站需求文档

## 1. 产品概述

### 1.1 产品名称

**Echora**

### 1.2 产品定位

Echora 是一个面向中文用户的 AI 英语情景练习网站，通过 AI 自动生成大量英汉双语情景对话，并将对话内容结构化为可练习、可批改、可复盘的数据。

V1 阶段聚焦 **汉译英能力训练**，采用从低到高的三阶段迭代练习方式：

1. 每句隐藏一个空
2. 每句隐藏一半空
3. 整句汉译英

系统根据用户初始水平、练习成绩、历史错误和最近练习内容，自动调整后续生成内容的难度，并支持长期复盘和薄弱点强化。

---

## 2. 目标用户

### 2.1 用户群体

产品面向以下用户群体，但 V1 优先服务成人通用英语学习场景：

| 用户类型 | 说明 |
|---|---|
| 成人自学英语用户 | 希望提升实际表达能力 |
| 中小学生 | 后期可扩展儿童/学生模式 |
| 大学生/考试用户 | 后期可扩展四六级、考研、雅思托福模式 |
| 职场用户 | 后期可扩展商务英语、会议、邮件表达 |
| 出国/旅游用户 | 适合情景英语训练 |
| 泛英语学习者 | 通过场景化练习提升语感和表达能力 |

### 2.2 V1 核心用户

V1 重点服务：

> 有一定英语基础，希望通过中文到英文的表达训练，提高真实场景英语输出能力的用户。

---

## 3. 产品目标

### 3.1 核心目标

1. 通过 AI 持续生成多样化情景对话，避免练习内容重复。
2. 将情景对话结构化，便于出题、批改、复盘和后续训练。
3. 用三阶段汉译英练习方式，让用户逐步从提示式输入过渡到完整英文表达。
4. 根据用户成绩自动调节难度，形成个性化学习路径。
5. 保存用户练习历史、错题、薄弱点和场景数据，支持长期复盘。
6. 提供主聊天窗口和辅助解析窗口，允许用户针对任意句子或题目深入提问。

---

## 4. V1 功能边界

### 4.1 V1 包含功能

| 模块 | 是否包含 |
|---|---|
| 用户注册/登录 | 包含 |
| 初始难度选择 | 包含 |
| 初始水平短测 | 包含 |
| AI 生成 100 个场景主题 | 包含 |
| 从 100 个主题中随机选择 1 个 | 包含 |
| 最近 10 个场景主题记录 | 包含 |
| AI 生成英汉双语情景对话 | 包含 |
| JSON 结构化场景数据 | 包含 |
| 汉译英练习 | 包含 |
| 每句隐藏一个空 | 包含 |
| 每句隐藏一半空 | 包含 |
| 整句翻译 | 包含 |
| AI 即时批改 | 包含 |
| AI 错误解析 | 包含 |
| 用户连续追问 | 包含 |
| 练习历史保存 | 包含 |
| 错题保存 | 包含 |
| 复盘与重练 | 包含 |
| 薄弱点分析 | 包含 |
| 主聊天窗口 | 包含 |
| 辅助解析窗口 | 包含 |
| 学习目标选择 | 包含 |

### 4.2 V1 暂不包含功能

| 功能 | 处理方式 |
|---|---|
| 口语练习 | 暂不做 |
| 听力播放 | 暂不做 |
| 发音评分 | 暂不做 |
| 实时语音对话 | 暂不做 |
| 英译汉 | 后续扩展 |
| 选择题 | 后续扩展 |
| 找错题 | 后续扩展 |
| 创意回答 | 后续扩展 |
| 多人学习/班级管理 | 后续扩展 |
| 语义相似度去重 | V1 不做 |

---

## 5. 核心业务流程

### 5.1 新用户首次进入流程

```text
用户注册/登录
    ↓
选择学习目标
    ↓
选择初始难度
    ↓
完成初始短测
    ↓
系统生成初始用户等级
    ↓
进入情景练习
```

### 5.2 常规练习流程

```text
用户点击开始练习
    ↓
系统读取用户等级、学习目标、最近 10 个场景主题
    ↓
AI 生成 100 个候选场景主题
    ↓
系统随机选择 1 个场景主题
    ↓
记录该场景主题到最近场景队列
    ↓
AI 根据主题生成英汉双语情景对话 JSON
    ↓
系统生成三阶段汉译英练习
    ↓
用户逐题作答
    ↓
AI 即时批改与解析
    ↓
保存答题记录、错题、得分、薄弱点
    ↓
完成本轮练习
    ↓
系统更新用户难度
    ↓
生成复盘建议
```

---

## 6. 学习目标设计

### 6.1 学习目标类型

用户可以选择一个或多个学习目标：

| 目标 | 说明 |
|---|---|
| daily_english | 日常交流 |
| travel_english | 旅游英语 |
| business_english | 商务英语 |
| interview_english | 面试英语 |
| campus_english | 校园英语 |
| shopping_english | 购物消费 |
| restaurant_english | 餐厅点餐 |
| medical_english | 医疗就诊 |
| phone_english | 电话沟通 |
| technical_english | 技术交流 |
| social_english | 社交闲聊 |
| life_abroad | 海外生活 |
| exam_expression | 考试表达 |

### 6.2 学习目标对 AI 生成的影响

AI 生成场景时应综合以下条件：

```json
{
  "userLevel": "B1",
  "difficultyScore": 420,
  "learningGoals": ["daily_english", "business_english"],
  "recentSceneTopics": [
    "ordering coffee at a cafe",
    "asking for directions in a city"
  ],
  "weaknessTags": ["past_tense", "preposition", "word_order"]
}
```

生成结果应优先满足：

1. 符合用户学习目标。
2. 符合当前英语水平。
3. 避免最近 10 个场景主题。
4. 适当覆盖用户薄弱点。
5. 场景具有真实交流价值。

---

## 7. 难度体系设计

### 7.1 难度体系

系统采用双层难度体系：

#### 用户可见难度

| 用户显示等级 | 对应 CEFR |
|---|---|
| 入门 | A1 |
| 初级 | A2 |
| 中级 | B1 |
| 中高级 | B2 |
| 高级 | C1 |
| 精通 | C2 |

#### 系统内部难度分

系统内部维护 `difficultyScore`，范围为 0-1000。

| 分数范围 | CEFR |
|---|---|
| 0-149 | A1 |
| 150-299 | A2 |
| 300-499 | B1 |
| 500-699 | B2 |
| 700-849 | C1 |
| 850-1000 | C2 |

### 7.2 难度约束

AI 生成内容时，必须参考确定性约束，不能只依赖“简单/中等/困难”这类模糊描述。

#### A1 级别约束

| 项目 | 约束 |
|---|---|
| 句长 | 5-8 个英文词 |
| 对话轮次 | 4-6 轮 |
| 语法 | be 动词、一般现在时、简单疑问句 |
| 词汇 | 高频生活词 |
| 中文含义 | 简单直接 |
| 表达 | 避免从句、复杂时态 |

#### A2 级别约束

| 项目 | 约束 |
|---|---|
| 句长 | 6-10 个英文词 |
| 对话轮次 | 6-8 轮 |
| 语法 | 一般现在时、一般过去时、一般将来时 |
| 词汇 | 常见生活和旅行表达 |
| 表达 | 可包含简单连接词 because, but, so |

#### B1 级别约束

| 项目 | 约束 |
|---|---|
| 句长 | 8-14 个英文词 |
| 对话轮次 | 8-10 轮 |
| 语法 | 现在完成时、情态动词、宾语从句 |
| 词汇 | 日常、职场、校园常用表达 |
| 表达 | 可以表达原因、建议、计划、偏好 |

#### B2 级别约束

| 项目 | 约束 |
|---|---|
| 句长 | 12-18 个英文词 |
| 对话轮次 | 10-12 轮 |
| 语法 | 条件句、定语从句、被动语态 |
| 词汇 | 商务、抽象话题、观点表达 |
| 表达 | 支持解释、对比、协商、委婉表达 |

#### C1 级别约束

| 项目 | 约束 |
|---|---|
| 句长 | 15-24 个英文词 |
| 对话轮次 | 12-16 轮 |
| 语法 | 复杂从句、让步结构、强调结构 |
| 词汇 | 高级表达、抽象词汇、语域变化 |
| 表达 | 支持逻辑论证、细腻态度、隐含语气 |

#### C2 级别约束

| 项目 | 约束 |
|---|---|
| 句长 | 18-30 个英文词 |
| 对话轮次 | 12-18 轮 |
| 语法 | 高级句式、复杂修辞、自然口语省略 |
| 词汇 | 接近母语者真实表达 |
| 表达 | 支持复杂观点、幽默、反讽、隐喻 |

---

## 8. 初始水平测试

### 8.1 初始流程

新用户第一次进入时：

1. 用户选择自认为的难度等级。
2. 系统生成 8-12 道短测题。
3. 题型仍采用 V1 的汉译英模式。
4. AI 根据结果判断用户实际等级。
5. 系统生成初始 `difficultyScore`。

### 8.2 初始测试题型

短测可以包含三类题：

| 类型 | 数量 |
|---|---:|
| 每句隐藏一个空 | 3-4 题 |
| 每句隐藏一半空 | 3-4 题 |
| 整句翻译 | 2-4 题 |

### 8.3 初始定级规则

系统根据用户自选等级和短测表现共同决定初始等级：

```text
初始分数 = 用户自选等级基础分 + 测试修正分
```

示例：

| 用户自选等级 | 基础分 |
|---|---:|
| 入门 A1 | 80 |
| 初级 A2 | 220 |
| 中级 B1 | 400 |
| 中高级 B2 | 600 |
| 高级 C1 | 780 |

测试修正：

| 测试得分 | 修正 |
|---|---:|
| ≥ 90 | +80 |
| 80-89 | +40 |
| 70-79 | +10 |
| 60-69 | -20 |
| < 60 | -60 |

限制：

1. 初始测试最多上调一个 CEFR 等级。
2. 初始测试最多下调一个 CEFR 等级。
3. 用户可手动修改系统建议等级。

---

## 9. 场景主题生成机制

### 9.1 基本规则

每次开始新练习时，系统调用 AI 生成 100 个候选场景主题。

AI 生成时需要输入：

```json
{
  "userLevel": "B1",
  "difficultyScore": 420,
  "learningGoals": ["daily_english"],
  "recentSceneTopics": [
    "ordering food at a restaurant",
    "asking for help at a train station"
  ],
  "weaknessTags": ["preposition", "word_order"],
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

### 9.2 随机选择规则

系统从 100 个主题中随机选择 1 个作为本次练习主题。

随机时可以做基础过滤：

1. 必须符合当前用户等级。
2. 必须符合用户学习目标。
3. 不允许与最近 10 个主题标题完全相同。
4. 不允许 AI 明确标记为与最近主题重复。

V1 不做语义相似度判断。

### 9.3 最近场景队列

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

---

## 10. 场景对话生成设计

### 10.1 场景内容组成

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

### 10.2 场景 JSON 结构

```json
{
  "sceneId": "scene_10001",
  "theme": {
    "titleEn": "Returning a damaged product at a store",
    "titleZh": "在商店退换损坏商品",
    "category": "shopping_english",
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

---

## 11. V1 练习题型设计：三阶段汉译英

V1 只做一种核心练习：

> 基于场景对话的汉译英迭代练习。

但每句话分成三个难度阶段。

---

### 11.1 阶段一：每句隐藏一个空

#### 目标

让用户在强提示下补全关键英文单词或短语。

#### 形式

系统显示英文句子，但隐藏一个关键空位，同时给出中文意思。

示例：

```text
中文：你好，我想退掉这个充电器，因为它不能用。

英文：Hi, I would like to ______ this charger because it does not work.
```

用户输入：

```text
return
```

#### 适合训练

| 能力 | 说明 |
|---|---|
| 关键词记忆 | 记住重点词 |
| 句型熟悉 | 熟悉完整英文结构 |
| 语法搭配 | 例如 would like to do |
| 低压力输入 | 降低刚开始练习的挫败感 |

---

### 11.2 阶段二：每句隐藏一半空

#### 目标

让用户在部分提示下重建句子结构。

#### 形式

系统隐藏约 40%-60% 的英文内容，保留核心线索。

示例：

```text
中文：你好，我想退掉这个充电器，因为它不能用。

英文：Hi, I ______ ______ to ______ this charger because it ______ not ______.
```

用户输入：

```text
would like / return / does / work
```

或者直接在空位中填写：

```text
would like
return
does
work
```

#### 适合训练

| 能力 | 说明 |
|---|---|
| 句子结构 | 掌握英文语序 |
| 固定搭配 | 掌握短语组合 |
| 助动词使用 | does / do / did 等 |
| 语法敏感度 | 主谓一致、时态、介词 |

---

### 11.3 阶段三：整句翻译

#### 目标

让用户脱离英文提示，完整输出英文句子。

#### 形式

系统只显示中文，用户输入完整英文。

示例：

```text
中文：你好，我想退掉这个充电器，因为它不能用。

请翻译成英文：
```

用户输入：

```text
Hi, I would like to return this charger because it does not work.
```

#### 适合训练

| 能力 | 说明 |
|---|---|
| 主动表达 | 从中文转换成英文 |
| 完整句构造 | 独立组织英文句子 |
| 场景表达 | 学会真实交流句 |
| 语感建立 | 逐步形成自然表达 |

---

## 12. 三阶段迭代练习流程

### 12.1 默认练习顺序

每个场景的所有句子按以下方式练习：

```text
第一轮：所有句子完成“隐藏一个空”
    ↓
第二轮：所有句子完成“隐藏一半空”
    ↓
第三轮：所有句子完成“整句翻译”
    ↓
生成本场景总结
```

### 12.2 可选练习顺序

后续可支持按句子迭代：

```text
第 1 句：隐藏一个空 → 隐藏一半空 → 整句翻译
第 2 句：隐藏一个空 → 隐藏一半空 → 整句翻译
第 3 句：隐藏一个空 → 隐藏一半空 → 整句翻译
```

### 12.3 V1 建议默认

V1 建议采用：

> **按阶段练习，而不是按句子练习。**

原因：

1. 用户更容易感受到难度递进。
2. 系统统计每个阶段得分更清晰。
3. 更方便判断用户到底是词汇弱、结构弱，还是完整表达弱。

---

## 13. 练习题 JSON 结构

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

---

## 14. 批改与评分机制

### 14.1 批改原则

AI 批改不能只判断对错，应同时给出：

1. 是否正确。
2. 得分。
3. 用户答案的问题。
4. 推荐答案。
5. 可接受表达。
6. 错误原因。
7. 相关知识点。
8. 简短鼓励或下一步建议。

### 14.2 不同阶段的评分方式

#### 阶段一：隐藏一个空

以精确匹配为主，AI 辅助判断为辅。

| 情况 | 得分 |
|---|---:|
| 完全正确 | 100 |
| 大小写错误 | 95 |
| 拼写轻微错误 | 70-85 |
| 词性错误 | 40-60 |
| 完全错误 | 0-30 |

#### 阶段二：隐藏一半空

按多个空位分别评分。

```text
阶段二得分 = 正确空位数 / 总空位数 × 100 - 语法惩罚
```

示例：

| 情况 | 惩罚 |
|---|---:|
| 单词正确但顺序错误 | -10 |
| 助动词错误 | -15 |
| 时态错误 | -15 |
| 介词错误 | -8 |
| 拼写小错 | -5 |

#### 阶段三：整句翻译

整句翻译采用综合评分。

| 维度 | 权重 |
|---|---:|
| 含义准确 | 35% |
| 语法正确 | 25% |
| 词汇自然 | 15% |
| 句子完整 | 15% |
| 场景语气 | 10% |

示例输出：

```json
{
  "isCorrect": false,
  "score": 82,
  "userAnswer": "Hi, I want return this charger because it not work.",
  "referenceAnswer": "Hi, I would like to return this charger because it does not work.",
  "correctedAnswer": "Hi, I want to return this charger because it does not work.",
  "analysisZh": "你的意思基本正确，但有两个语法问题。第一，want 后面需要接 to do，所以应该是 want to return。第二，it not work 缺少助动词 does，应该是 it does not work。",
  "errorTags": ["infinitive_after_want", "auxiliary_does", "simple_present"],
  "suggestionZh": "这句话可以重点记住两个结构：want to do 和 it does not work。"
}
```

---

## 15. 即时解析机制

### 15.1 用户答题后立即反馈

每答一道题后，系统立即显示：

```text
结果：部分正确，82 分

你的答案：
Hi, I want return this charger because it not work.

推荐答案：
Hi, I would like to return this charger because it does not work.

问题分析：
1. want 后面要加 to。
2. it not work 缺少助动词 does。
3. would like to 比 want to 更礼貌，适合退货场景。

重点句型：
I would like to + 动词原形
```

### 15.2 连续追问

用户可以继续问：

```text
为什么这里要用 does？
would like to 和 want to 有什么区别？
这句话能不能说得更口语一点？
```

AI 应基于当前题目上下文回答，不脱离原场景。

---

## 16. 主聊天窗口与辅助聊天窗口

### 16.1 主聊天窗口

主聊天窗口负责核心练习流程：

1. 展示当前场景。
2. 展示当前练习题。
3. 接收用户答案。
4. 返回批改结果。
5. 推进下一题。
6. 展示场景总结。

主窗口风格类似智能体对话，但必须有明确状态控制。

### 16.2 辅助聊天窗口

辅助聊天窗口用于针对某条内容建立聊天分支。

用户可以对以下对象打开辅助窗口：

| 对象 | 示例 |
|---|---|
| 某句英文 | 解析句子结构 |
| 某个单词 | 解释用法 |
| 某道错题 | 详细讲错因 |
| 某个语法点 | 继续追问 |
| 某个推荐答案 | 要求换一种说法 |
| 某个场景 | 扩展更多表达 |

### 16.3 辅助窗口上下文

辅助窗口启动时，应携带上下文：

```json
{
  "sourceType": "question",
  "sceneId": "scene_10001",
  "lineId": "line_001",
  "questionId": "q_001_3",
  "userAnswer": "Hi, I want return this charger because it not work.",
  "referenceAnswer": "Hi, I would like to return this charger because it does not work.",
  "errorTags": ["infinitive_after_want", "auxiliary_does"]
}
```

---

## 17. 用户成绩与难度自动调整

### 17.1 单场景得分

每个场景最终得分由三阶段组成：

| 阶段 | 权重 |
|---|---:|
| 隐藏一个空 | 25% |
| 隐藏一半空 | 35% |
| 整句翻译 | 40% |

计算方式：

```text
sceneScore = stage1Score × 0.25 + stage2Score × 0.35 + stage3Score × 0.40
```

### 17.2 难度调整规则

每完成一个场景后，根据本场景得分调整 `difficultyScore`。

| 场景得分 | 调整 |
|---|---:|
| ≥ 90 | +20 |
| 80-89 | +10 |
| 70-79 | 0 |
| 60-69 | -10 |
| < 60 | -20 |

### 17.3 限制规则

1. 单次调整最大不超过 20 分。
2. 不允许一次跨越完整 CEFR 等级。
3. 最近 5 个场景平均分 ≥ 85，才允许升级到下一个 CEFR 等级。
4. 最近 5 个场景平均分 < 60，触发降级建议。
5. 连续 3 次低于 60 分，系统主动建议降低难度或进入复习模式。
6. 连续 3 次高于 90 分，系统主动建议提高难度或增加整句翻译比例。

### 17.4 难度变化示例

```json
{
  "before": {
    "level": "B1",
    "difficultyScore": 420
  },
  "sceneScore": 86,
  "adjustment": 10,
  "after": {
    "level": "B1",
    "difficultyScore": 430
  },
  "reason": "本场景得分超过 80 分，适当提升难度。"
}
```

---

## 18. 薄弱点分析

### 18.1 错误标签

每次 AI 批改后，应给错误打标签。

常见标签包括：

| 标签 | 含义 |
|---|---|
| spelling | 拼写错误 |
| word_order | 语序错误 |
| tense | 时态错误 |
| article | 冠词错误 |
| preposition | 介词错误 |
| subject_verb_agreement | 主谓一致 |
| auxiliary_verb | 助动词错误 |
| modal_verb | 情态动词错误 |
| infinitive | 不定式错误 |
| gerund | 动名词错误 |
| collocation | 搭配错误 |
| politeness | 语气不自然 |
| literal_translation | 中式直译 |
| missing_subject | 缺少主语 |
| missing_verb | 缺少谓语 |
| plural | 单复数错误 |

### 18.2 薄弱点统计

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

### 18.3 薄弱点影响后续场景生成

当用户存在明显薄弱点时，系统生成新场景时加入约束：

```json
{
  "weaknessTags": ["word_order", "preposition"],
  "generationInstruction": "The dialogue should naturally include several sentences that train word order in indirect questions and common preposition usage."
}
```

注意：薄弱点只影响生成内容的侧重点，不能导致场景生硬或为了语法而牺牲真实交流。

---

## 19. 复盘与重练功能

### 19.1 复盘首页

复盘页面展示：

| 内容 | 说明 |
|---|---|
| 最近练习场景 | 最近完成的场景 |
| 平均分趋势 | 近 7 天、近 30 天 |
| 错题数量 | 按标签统计 |
| 高频错误 | 例如介词、语序、时态 |
| 难度变化 | difficultyScore 曲线 |
| 推荐复习内容 | AI 生成复习建议 |

### 19.2 场景复盘

用户可以进入某个历史场景查看：

1. 原始情景对话。
2. 每一道题。
3. 用户答案。
4. AI 批改结果。
5. 错误解析。
6. 当时得分。
7. 可重新练习。

### 19.3 错题重练

错题重练有两种方式：

#### 原题重练

直接重新做历史错题。

#### 变体重练

AI 根据原错题生成类似但不完全相同的新题。

示例：

原错题：

```text
我想退掉这个充电器。
I want return this charger.
```

变体题：

```text
我想取消这个订单。
I want to cancel this order.
```

### 19.4 AI 复盘总结

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

---

## 20. 页面结构设计

### 20.1 页面列表

| 页面 | 功能 |
|---|---|
| 登录/注册页 | 用户账号入口 |
| 初始设置页 | 选择学习目标和初始难度 |
| 初始测试页 | 完成短测 |
| 首页 Dashboard | 展示学习进度、推荐练习 |
| 场景练习页 | 核心练习界面 |
| 场景复盘页 | 查看历史场景 |
| 错题本页 | 错题列表和重练 |
| 薄弱点分析页 | AI 总结薄弱点 |
| 用户设置页 | 调整目标、难度、偏好 |

### 20.2 首页 Dashboard

首页应展示：

1. 当前等级。
2. 当前 `difficultyScore`。
3. 最近 7 天练习次数。
4. 最近平均分。
5. 今日推荐练习。
6. 高频错误标签。
7. 最近场景列表。
8. 继续上次练习入口。

### 20.3 场景练习页布局

建议布局：

```text
┌──────────────────────────────────────┐
│ 顶部：Echora / 当前等级 / 得分 │
├──────────────────────────────────────┤
│ 左侧：场景信息 / 角色 / 当前阶段       │
├──────────────────────┬───────────────┤
│ 主聊天练习区          │ 辅助解析窗口   │
│                      │               │
│ AI 出题              │ 句子解析       │
│ 用户答题             │ 语法追问       │
│ 即时批改             │ 扩展表达       │
│ 下一题               │               │
└──────────────────────┴───────────────┘
```

### 20.4 主聊天区状态

主聊天区不是纯开放聊天，而是有状态机控制。

状态包括：

```text
scene_intro
stage_1_practice
stage_1_summary
stage_2_practice
stage_2_summary
stage_3_practice
scene_summary
free_question
```

---

## 21. 数据模型设计

### 21.1 User 用户表

```json
{
  "userId": "user_001",
  "email": "user@example.com",
  "nickname": "Alex",
  "nativeLanguage": "zh-CN",
  "targetLanguage": "en",
  "learningGoals": ["daily_english", "business_english"],
  "currentLevel": "B1",
  "difficultyScore": 420,
  "createdAt": "2026-05-13T10:00:00Z",
  "updatedAt": "2026-05-13T10:00:00Z"
}
```

### 21.2 Scene 场景表

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

### 21.3 RecentSceneQueue 最近场景队列表

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

### 21.4 ExerciseRecord 练习记录表

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

### 21.5 AnswerRecord 答题记录表

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

### 21.6 WeaknessProfile 薄弱点表

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

---

## 22. API 设计建议

### 22.1 用户初始化

```http
POST /api/users/onboarding
```

请求：

```json
{
  "learningGoals": ["daily_english"],
  "selectedLevel": "B1"
}
```

响应：

```json
{
  "userId": "user_001",
  "initialTestRequired": true
}
```

---

### 22.2 生成初始测试

```http
POST /api/placement-test/generate
```

响应：

```json
{
  "testId": "test_001",
  "questions": []
}
```

---

### 22.3 提交初始测试

```http
POST /api/placement-test/submit
```

响应：

```json
{
  "level": "B1",
  "difficultyScore": 420,
  "analysis": "你的基础接近 B1，但完整句翻译中助动词使用不稳定。"
}
```

---

### 22.4 生成新场景

```http
POST /api/scenes/generate
```

请求：

```json
{
  "userId": "user_001"
}
```

响应：

```json
{
  "sceneId": "scene_10001",
  "scene": {},
  "exerciseSet": {}
}
```

---

### 22.5 提交答案

```http
POST /api/exercises/answer
```

请求：

```json
{
  "userId": "user_001",
  "sceneId": "scene_10001",
  "questionId": "q_001_3",
  "userAnswer": "Hi, I want return this charger because it not work."
}
```

响应：

```json
{
  "score": 82,
  "isCorrect": false,
  "referenceAnswer": "Hi, I would like to return this charger because it does not work.",
  "analysisZh": "你的意思基本正确，但有两个语法问题……",
  "errorTags": ["infinitive", "auxiliary_verb"]
}
```

---

### 22.6 完成场景

```http
POST /api/scenes/complete
```

响应：

```json
{
  "sceneScore": 81,
  "difficultyBefore": 420,
  "difficultyAfter": 430,
  "summary": "本次表现不错，完整句翻译还有提升空间。",
  "weaknessTags": ["auxiliary_verb", "word_order"]
}
```

---

### 22.7 获取复盘报告

```http
GET /api/review/summary?range=last_10_scenes
```

响应：

```json
{
  "averageScore": 78,
  "mainWeaknesses": [],
  "recommendedPractice": []
}
```

---

## 23. AI Prompt 设计要求

### 23.1 生成 100 个场景主题 Prompt 要点

AI 必须遵守：

1. 生成 100 个主题。
2. 主题必须适合用户当前 CEFR 等级。
3. 主题必须符合用户学习目标。
4. 不要生成最近 10 个场景主题相同或明显相关的主题。
5. 每个主题要有英文标题、中文标题、分类、目标表达、知识点标签。
6. 输出必须是 JSON。
7. 不允许输出 Markdown。
8. 不允许输出解释性文字。

### 23.2 生成场景对话 Prompt 要点

AI 必须遵守：

1. 根据选中的主题生成完整情景对话。
2. 输出英汉双语。
3. 每句话必须有唯一 `lineId`。
4. 每句话必须有英文、自然中文、直译中文。
5. 每句话必须标注语法标签、词汇标签、难度标签。
6. 对话难度必须符合用户当前等级约束。
7. 对话内容必须真实自然，不能像教材硬编。
8. 输出必须符合 JSON Schema。

### 23.3 批改 Prompt 要点

AI 批改时必须遵守：

1. 根据当前题目、参考答案、用户答案进行判断。
2. 不能只看是否和标准答案完全一致。
3. 可接受自然表达。
4. 必须指出错误原因。
5. 必须输出错误标签。
6. 必须给出推荐修改版本。
7. 必须输出 JSON。
8. 解析语言使用中文。

---

## 24. 非功能需求

### 24.1 性能要求

| 项目 | 要求 |
|---|---|
| 页面首次加载 | < 3 秒 |
| 普通接口响应 | < 500ms |
| AI 批改响应 | 建议 < 5 秒 |
| AI 场景生成 | 建议 < 15 秒 |
| 历史记录查询 | < 1 秒 |

### 24.2 稳定性要求

1. AI 输出必须做 JSON Schema 校验。
2. AI 输出不合法时自动重试。
3. 重试失败时返回友好错误。
4. 用户答题记录必须先保存，再进入下一题。
5. 练习过程中刷新页面，应能恢复进度。

### 24.3 数据安全

1. 用户数据隔离。
2. 答题记录不可串号。
3. AI Prompt 中不传递敏感隐私。
4. 支持用户删除历史数据。
5. 后期支持数据导出。

### 24.4 可扩展性

V1 虽然只做汉译英，但系统应预留题型扩展能力。

建议抽象为：

```json
{
  "exerciseType": "zh_to_en",
  "stage": "single_blank",
  "gradingStrategy": "ai_assisted"
}
```

后续扩展：

```json
[
  "en_to_zh",
  "multiple_choice",
  "error_correction",
  "creative_answer",
  "role_play",
  "dictation",
  "listening"
]
```

---

## 25. 推荐技术架构

### 25.1 前端

建议技术栈：

| 技术 | 用途 |
|---|---|
| Next.js / React | Web 前端 |
| TypeScript | 类型安全 |
| Tailwind CSS | UI 样式 |
| Zustand / Redux | 状态管理 |
| React Query | 接口请求和缓存 |

### 25.2 后端

建议技术栈：

| 技术 | 用途 |
|---|---|
| Node.js / Python | 后端服务 |
| PostgreSQL | 主数据库 |
| Redis | 会话状态、缓存 |
| Prisma / SQLAlchemy | ORM |
| Object Storage | 后续保存导出数据 |
| AI Provider SDK | 调用大模型 |

### 25.3 AI 服务层

建议单独封装 AI Service：

```text
AIService
 ├── generateSceneThemes()
 ├── generateSceneDialogue()
 ├── generateExercises()
 ├── gradeAnswer()
 ├── summarizeScene()
 ├── analyzeWeakness()
 └── generateReviewPractice()
```

不要把 AI 调用逻辑散落在业务代码里。

---

## 26. 状态机设计

### 26.1 练习状态

```json
{
  "practiceSessionId": "session_001",
  "userId": "user_001",
  "sceneId": "scene_10001",
  "currentStage": 2,
  "currentQuestionIndex": 5,
  "status": "in_progress",
  "stageProgress": {
    "stage1": "completed",
    "stage2": "in_progress",
    "stage3": "not_started"
  }
}
```

### 26.2 状态流转

```text
created
  ↓
scene_generated
  ↓
stage_1_in_progress
  ↓
stage_1_completed
  ↓
stage_2_in_progress
  ↓
stage_2_completed
  ↓
stage_3_in_progress
  ↓
stage_3_completed
  ↓
completed
```

---

## 27. V1 验收标准

### 27.1 场景生成验收

1. 每次能生成 100 个候选主题。
2. 系统能随机选择 1 个主题。
3. 最近 10 个主题能正确保存。
4. 生成新主题时会把最近 10 个主题传入 AI。
5. 生成的场景对话必须是英汉双语。
6. 场景 JSON 必须通过 Schema 校验。

### 27.2 练习功能验收

1. 每个场景能生成三阶段练习。
2. 阶段一支持每句隐藏一个空。
3. 阶段二支持每句隐藏一半空。
4. 阶段三支持整句翻译。
5. 用户提交答案后能立即获得批改。
6. 批改结果包含得分、正确答案、错误原因和知识点标签。
7. 用户可以继续追问某道题。

### 27.3 难度调整验收

1. 用户有 CEFR 等级。
2. 用户有内部 `difficultyScore`。
3. 完成场景后按分数调整难度。
4. 单次调整不超过 20 分。
5. 系统能根据最近成绩给出升降级建议。

### 27.4 复盘功能验收

1. 用户能查看历史场景。
2. 用户能查看每道题的历史答案。
3. 用户能查看错题。
4. 用户能重新练习错题。
5. 系统能总结最近薄弱点。
6. 系统能根据薄弱点推荐新练习方向。

---

## 28. 迭代规划

### 28.1 V1：文本汉译英核心闭环

重点完成：

1. 用户初始化。
2. 学习目标选择。
3. 初始难度选择。
4. 初始短测。
5. AI 场景主题生成。
6. AI 情景对话生成。
7. 三阶段汉译英练习。
8. AI 即时批改。
9. 历史保存。
10. 错题复盘。
11. 难度自动调整。
12. 主聊天窗口 + 辅助解析窗口。

### 28.2 V1.1：体验优化

可增加：

1. 场景收藏。
2. 错题变体练习。
3. 每日练习计划。
4. 连续学习天数。
5. 学习报告导出。
6. 自定义场景主题。

### 28.3 V1.5：更多题型

增加：

1. 英译汉。
2. 选择题。
3. 找错题。
4. 角色互换默写。
5. 创意回答。
6. 专项练习模式。

### 28.4 V2：语音与听力

增加：

1. 英文朗读。
2. 听力填空。
3. 用户录音。
4. ASR 识别。
5. 发音评分。
6. 实时语音对话。

### 28.5 V3：学习智能体

增加：

1. 长期学习规划。
2. 个性化课程路径。
3. 多智能体陪练。
4. 场景剧情连续化。
5. 考试模式。
6. 教师/家长/班级管理后台。

---

## 29. 风险点与解决方案

### 29.1 AI 输出不稳定

风险：

AI 可能输出格式错误、字段缺失、难度不一致。

解决方案：

1. 使用严格 JSON Schema。
2. 输出失败自动重试。
3. 后端做字段校验。
4. 难度约束写入 Prompt。
5. 对话内容生成后进行二次质量检查。

---

### 29.2 难度波动过大

风险：

AI 生成内容有时过难，有时过简单。

解决方案：

1. 使用 CEFR + `difficultyScore`。
2. 使用明确句长、词汇、语法约束。
3. 单次难度调整限制在 ±20。
4. 最近 5 次平均成绩决定是否跨等级。
5. 保留人工修改难度入口。

---

### 29.3 场景重复

风险：

AI 可能反复生成类似场景。

V1 解决方案：

1. 保存最近 10 个场景主题。
2. 传给 AI 作为排除列表。
3. 禁止生成完全相同或明显相关主题。
4. 系统层面过滤完全相同标题。

V1 不做：

1. 向量相似度判断。
2. 语义相似度检测。
3. 自动聚类去重。

---

### 29.4 批改过严或过松

风险：

汉译英存在多种正确表达，AI 可能误判。

解决方案：

1. 阶段一、二尽量使用确定答案。
2. 阶段三采用多维度评分。
3. 允许自然表达。
4. 保存参考答案和可接受答案。
5. 批改 Prompt 明确“不能只做字符串匹配”。

---

### 29.5 用户学习挫败感

风险：

整句翻译太难，用户容易放弃。

解决方案：

1. 先隐藏一个空。
2. 再隐藏一半空。
3. 最后整句翻译。
4. 允许查看提示。
5. 错误解析要简洁、鼓励、可执行。
6. 连续低分自动降难度。

---

## 30. 核心产品判断

Echora 的核心竞争力不在于“AI 能聊天”，而在于：

> 把 AI 生成内容、结构化题目、即时批改、难度调节、错题复盘和长期学习画像串成一个稳定闭环。

V1 不应该贪多。最重要的是先把这条链路做扎实：

```text
生成场景
  ↓
结构化对话
  ↓
三阶段汉译英
  ↓
即时批改
  ↓
错误标签
  ↓
难度调整
  ↓
复盘重练
  ↓
根据薄弱点生成新场景
```

只要这个闭环跑通，后续增加英译汉、选择题、口语、听力、考试模式都会比较自然。
