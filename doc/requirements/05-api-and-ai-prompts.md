# 05. API 与 AI Prompt

## 1. API 设计建议

V1 使用 RESTful API。所有需要登录的接口使用 JWT 鉴权，所有输入输出使用 Zod 或等价 schema 校验。

### 1.1 用户初始化

```http
POST /api/users/onboarding
```

请求：

```json
{
  "generationMode": "category_constrained",
  "scenarioCategories": ["daily_english"],
  "categoryMatchThreshold": 0.7,
  "customScenarioText": null,
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

### 1.2 生成初始测试

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

### 1.3 提交初始测试

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

### 1.4 生成新场景

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

### 1.5 获取当前练习会话

```http
GET /api/practice/sessions/current
```

响应：

```json
{
  "practiceSessionId": "session_001",
  "status": "in_progress",
  "scene": {},
  "exerciseSet": {},
  "currentStage": 2,
  "currentQuestionIndex": 5
}
```

### 1.6 提交答案

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

### 1.7 完成场景

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

### 1.8 获取复盘报告

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

### 1.9 创建辅助解析线程

```http
POST /api/chat/threads
```

请求：

```json
{
  "sourceType": "question",
  "sceneId": "scene_10001",
  "lineId": "line_001",
  "questionId": "q_001_3"
}
```

响应：

```json
{
  "threadId": "thread_001",
  "context": {}
}
```

### 1.10 辅助解析连续追问

```http
POST /api/chat/threads/thread_001/messages
```

请求：

```json
{
  "message": "为什么这里不能说 it not work？"
}
```

响应：

```json
{
  "messageId": "message_001",
  "answerZh": "英语否定一般现在时需要助动词 do 或 does。主语是 it，所以要用 does not work。"
}
```

## 2. AI Prompt 设计要求

### 2.1 生成 100 个场景主题 Prompt 要点

AI 必须遵守：

1. 生成 100 个主题。
2. 主题必须适合用户当前 CEFR 等级。
3. 如果 `generationMode` 为 `category_constrained`，主题必须满足场景类别和阈值要求。
4. 如果 `generationMode` 为 `open_random`，不做场景类别约束，但主题必须真实、自然、多样。
5. 如果 `generationMode` 为 `custom_scenario`，必须先理解用户自定义意图，再规范化为标准场景主题。
6. 不要生成最近 10 个场景主题相同或明显相关的主题。
7. 每个主题要有英文标题、中文标题、分类、类别匹配分、目标表达、知识点标签。
8. 输出必须是 JSON。
9. 不允许输出 Markdown。
10. 不允许输出解释性文字。

### 2.2 生成场景对话 Prompt 要点

AI 必须遵守：

1. 根据选中的主题生成完整情景对话。
2. 输出英汉双语。
3. 每句话必须有唯一 `lineId`。
4. 每句话必须有英文、自然中文、直译中文。
5. 每句话必须标注语法标签、词汇标签、难度标签。
6. 对话难度必须符合用户当前等级约束。
7. 对话内容必须真实自然，不能像教材硬编。
8. 输出必须符合 JSON Schema。

### 2.3 生成练习题 Prompt 要点

AI 或规则生成器必须遵守：

1. 阶段一每句只隐藏一个关键单词或短语。
2. 阶段二隐藏约 40%-60% 的英文内容，保留足够线索。
3. 阶段三只展示中文并要求完整英文输出。
4. 题目必须引用原始 `lineId`。
5. 每道题必须有可校验的参考答案。
6. 题目标签必须能回写到薄弱点统计。

### 2.4 批改 Prompt 要点

AI 批改时必须遵守：

1. 根据当前题目、参考答案、用户答案进行判断。
2. 不能只看是否和标准答案完全一致。
3. 可接受自然表达。
4. 必须指出错误原因。
5. 必须输出错误标签。
6. 必须给出推荐修改版本。
7. 必须输出 JSON。
8. 解析语言使用中文。

### 2.5 复盘总结 Prompt 要点

AI 生成复盘总结时必须遵守：

1. 基于真实历史答题数据，不编造不存在的练习表现。
2. 先总结整体趋势，再列出 2-4 个主要薄弱点。
3. 每个薄弱点给出例句或典型错误。
4. 给出下一阶段可执行建议。
5. 输出语言使用中文，语气具体、温和、不过度表扬。

## 3. AI 输出校验与重试

1. 所有 AI JSON 输出必须使用 schema 校验。
2. 校验失败时，优先把错误字段传给 AI 请求结构修复。
3. 单次任务最多自动重试 2 次。
4. 重试失败后返回友好错误，并保留用户可重试入口。
5. 批改类失败不能丢失用户答案。
6. 场景生成类失败不能写入最近场景队列。

## 4. AI Provider 抽象接口

V1 后端应封装独立 AI Service，不允许在路由中散落 provider 调用。

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

Provider 层建议接口：

```ts
export interface AiProvider {
  name: string
  generateJson<T>(request: AiJsonRequest<T>): Promise<T>
  generateText(request: AiTextRequest): Promise<string>
}
```

Provider 配置应支持：

1. 多 provider 列表。
2. API key 从环境变量或本地配置读取。
3. 请求超时。
4. 失败切换。
5. 最小调用日志，避免记录敏感输入。
