# 03. 练习、批改与对话窗口

## 1. V1 核心题型：三阶段汉译英

V1 只做一种核心练习：

> 基于场景对话的汉译英迭代练习。

每句话分成三个难度阶段，帮助用户从低压力提示输入逐步过渡到完整英文表达。

## 2. 阶段一：每句隐藏一个空

### 2.1 目标

让用户在强提示下补全关键英文单词或短语。

### 2.2 形式

```text
中文：你好，我想退掉这个充电器，因为它不能用。

英文：Hi, I would like to ______ this charger because it does not work.
```

用户输入：

```text
return
```

### 2.3 适合训练

| 能力 | 说明 |
|---|---|
| 关键词记忆 | 记住重点词 |
| 句型熟悉 | 熟悉完整英文结构 |
| 语法搭配 | 例如 would like to do |
| 低压力输入 | 降低刚开始练习的挫败感 |

## 3. 阶段二：每句隐藏一半空

### 3.1 目标

让用户在部分提示下重建句子结构。

### 3.2 形式

```text
中文：你好，我想退掉这个充电器，因为它不能用。

英文：Hi, I ______ ______ to ______ this charger because it ______ not ______.
```

用户可以直接在多个空位中填写：

```text
would like
return
does
work
```

### 3.3 适合训练

| 能力 | 说明 |
|---|---|
| 句子结构 | 掌握英文语序 |
| 固定搭配 | 掌握短语组合 |
| 助动词使用 | does / do / did 等 |
| 语法敏感度 | 主谓一致、时态、介词 |

## 4. 阶段三：整句翻译

### 4.1 目标

让用户脱离英文提示，完整输出英文句子。

### 4.2 形式

```text
中文：你好，我想退掉这个充电器，因为它不能用。

请翻译成英文：
```

用户输入：

```text
Hi, I would like to return this charger because it does not work.
```

### 4.3 适合训练

| 能力 | 说明 |
|---|---|
| 主动表达 | 从中文转换成英文 |
| 完整句构造 | 独立组织英文句子 |
| 场景表达 | 学会真实交流句 |
| 语感建立 | 逐步形成自然表达 |

## 5. 三阶段迭代练习流程

### 5.1 默认练习顺序

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

### 5.2 可选练习顺序

后续可支持按句子迭代：

```text
第 1 句：隐藏一个空 → 隐藏一半空 → 整句翻译
第 2 句：隐藏一个空 → 隐藏一半空 → 整句翻译
第 3 句：隐藏一个空 → 隐藏一半空 → 整句翻译
```

### 5.3 V1 默认建议

V1 建议采用：

> 按阶段练习，而不是按句子练习。

原因：

1. 用户更容易感受到难度递进。
2. 系统统计每个阶段得分更清晰。
3. 更方便判断用户到底是词汇弱、结构弱，还是完整表达弱。

## 6. 批改与评分机制

### 6.1 批改原则

AI 批改不能只判断对错，应同时给出：

1. 是否正确。
2. 得分。
3. 用户答案的问题。
4. 推荐答案。
5. 可接受表达。
6. 错误原因。
7. 相关知识点。
8. 简短鼓励或下一步建议。

### 6.2 阶段一评分

阶段一以精确匹配为主，AI 辅助判断为辅。

| 情况 | 得分 |
|---|---:|
| 完全正确 | 100 |
| 大小写错误 | 95 |
| 拼写轻微错误 | 70-85 |
| 词性错误 | 40-60 |
| 完全错误 | 0-30 |

### 6.3 阶段二评分

阶段二按多个空位分别评分。

```text
阶段二得分 = 正确空位数 / 总空位数 × 100 - 语法惩罚
```

| 情况 | 惩罚 |
|---|---:|
| 单词正确但顺序错误 | -10 |
| 助动词错误 | -15 |
| 时态错误 | -15 |
| 介词错误 | -8 |
| 拼写小错 | -5 |

### 6.4 阶段三评分

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
  "errorTags": ["infinitive_after_want", "auxiliary_does"],
  "encouragementZh": "表达方向是对的，下一次重点检查动词前后是否需要 to 或助动词。"
}
```

## 7. 主聊天窗口与辅助解析窗口

### 7.1 主聊天窗口

主聊天窗口用于承载核心练习流程。它看起来像聊天，但必须有明确状态控制。

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

### 7.2 辅助解析窗口

辅助聊天窗口用于针对某条内容建立聊天分支。用户可以对以下对象打开辅助窗口：

| 对象 | 示例 |
|---|---|
| 某句英文 | 解析句子结构 |
| 某个单词 | 解释用法 |
| 某道错题 | 详细讲错因 |
| 某个语法点 | 继续追问 |
| 某个推荐答案 | 要求换一种说法 |
| 某个场景 | 扩展更多表达 |

### 7.3 辅助窗口上下文

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

## 8. 用户成绩与难度自动调整

### 8.1 单场景得分

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

### 8.2 难度调整规则

每完成一个场景后，根据本场景得分调整 `difficultyScore`。

| 场景得分 | 调整 |
|---|---:|
| ≥ 90 | +20 |
| 80-89 | +10 |
| 70-79 | 0 |
| 60-69 | -10 |
| < 60 | -20 |

### 8.3 限制规则

1. 单次调整最大不超过 20 分。
2. 不允许一次跨越完整 CEFR 等级。
3. 最近 5 个场景平均分 ≥ 85，才允许升级到下一个 CEFR 等级。
4. 最近 5 个场景平均分 < 60，触发降级建议。
5. 连续 3 次低于 60 分，系统主动建议降低难度或进入复习模式。
6. 连续 3 次高于 90 分，系统主动建议提高难度或增加整句翻译比例。

### 8.4 难度变化示例

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

## 9. 练习会话状态机

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

状态流转：

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

## 10. 中断与恢复

1. 用户答题记录必须先保存，再进入下一题。
2. 练习过程中刷新页面，应能恢复到当前场景、当前阶段和当前题目。
3. 如果 AI 批改失败，用户答案必须保留，并允许重试批改。
4. 如果场景生成失败，应提供重新生成入口，不应丢失当前用户配置。
