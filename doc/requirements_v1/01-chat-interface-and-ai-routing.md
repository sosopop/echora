# 01. 聊天界面、Skill 体系与 AI 路由

## 1. Skill 体系设计

### 1.1 核心概念

Skill 是 Echora 内部功能的基本单元。每个 Skill 封装一个独立的业务能力。AI 根据用户输入和对话上下文，从 Skill Registry 中提出合适的调用建议；系统根据当前学习流状态和权限规则决定是否执行。

这类似于 MCP（Model Context Protocol）中 AI 调用工具的模式：系统告知 AI 有哪些可用工具及其描述，AI 自主决定何时调用哪个工具。用户界面不展示 Skill、AI Router、confidence、事件名等术语，只展示自然的学习状态和小部件。

状态机、Widget 字段、确定性动作和会话锁定规则以 `08-ai-workflow-and-widget-contract.md` 为准。

### 1.2 Skill 定义

```ts
interface Skill {
  // 元数据
  name: string;              // 唯一标识，如 "practice"
  description: string;        // 功能描述，供 AI 理解何时调用
  triggerKeywords: string[];  // 触发关键词，辅助路由
  allowedStates: LearningState[]; // 允许被调用的主学习流状态
  nextStates?: LearningState[];   // Skill 完成后可能进入的状态

  // 输入
  inputSchema: ZodSchema;    // 参数 schema

  // 执行
  handler: (ctx: SkillContext) => AsyncIterable<SkillEvent>;

  // UI（可选）
  widgetType?: WidgetType;    // 关联的 Widget 组件名
  inputMode?: InputMode;      // 触发后输入框切换为哪种模式
}
```

### 1.3 Skill 执行上下文

```ts
interface SkillContext {
  userId: string;
  conversationId: string;
  learningState: LearningState;   // 当前主学习流状态
  userProfile: UserProfile;       // 用户画像（年龄、水平等）
  conversationHistory: Message[]; // 最近对话（用于上下文理解）
  params: Record<string, unknown>; // AI 提取的参数
  sourceRef?: SourceRef;           // 辅助追问或 Widget 动作来源
}
```

### 1.4 Skill 事件流

Skill 执行时通过 AsyncIterable 流式产出事件：

```ts
type SkillEvent =
  | { type: 'text-chunk'; data: string }           // 文本增量
  | { type: 'widget-init'; widgetType: string }     // 初始化 Widget
  | { type: 'widget-update'; field: string; data: unknown } // 更新 Widget 字段
  | { type: 'widget-ready' }                        // Widget 可交互
  | { type: 'mode-switch'; mode: InputMode }        // 切换输入框模式
  | { type: 'quick-actions'; actions: QuickAction[] } // 添加快捷按钮
  | { type: 'done' }                                // Skill 执行完成
  | { type: 'error'; message: string }              // 错误
```

### 1.5 V1 MVP Skill 注册表

```ts
const skillRegistry: Skill[] = [
  onboardingSkill,    // 收集用户画像
  sceneSelectSkill,   // 推荐 + 选择场景
  practiceSkill,      // 生成练习
  gradeSkill,         // 批改答案
  explainSkill,       // 深入解析
  reviewSkill,        // 学习报告
  retrySkill,         // 错题重练
  generalChatSkill,   // 兜底闲聊
];
```

### 1.6 Skill 注册与扩展

新增功能只需：
1. 定义 Skill 对象（name、description、handler、可选的 widgetType）
2. 注册到 skillRegistry
3. AI 自动获得该 Skill 的调用能力（因为 description 会传给 AI）

不需要修改路由代码、不需要加页面、不需要加路由。

## 2. AI 调度机制

### 2.1 路由流程

```text
用户自然输入 / 点击学习菜单
  ↓
系统校验当前 learningState、会话锁定和 action 合法性
  ↓
系统消息写入对话流（user-message / system-action）
  ↓
内部 AI 调度层接收：
  - 用户输入文本
  - 用户画像
  - 最近 10 条对话上下文
  - 可用 Skill 列表（name + description）
  - 当前 learningState
  ↓
AI 返回建议：{ skillName, params, confidence }
  ↓
系统二次校验 allowedStates / nextStates / 权限
  ↓
调用 skill.handler(ctx)，流式输出 SkillEvent
  ↓
前端逐步消费 SkillEvent，渲染文本 + Widget + 切换模式
```

### 2.2 内部调度 Prompt 设计

```
你是 Echora 的内部学习流调度器。根据用户输入和当前学习状态，判断应该调用哪个 Skill。

## 可用 Skill 列表
$SKILL_DESCRIPTIONS

## 用户画像
$USER_PROFILE_SUMMARY

## 最近对话
$RECENT_MESSAGES

## 当前激活的 Skill
$ACTIVE_SKILL

## 当前学习流状态
$LEARNING_STATE

## 指令
1. 如果当前有激活的 Skill（如 practice），优先判断用户是否在答题/追问/跳过
2. 根据用户意图或学习菜单动作匹配最合适的 Skill
3. 不要直接执行登录、保存、新建会话、提交答案、会话锁定或权限判断，这些由系统处理
4. 如果无法确定，返回 { "skillName": "general-chat", ... }
5. 置信度低于 0.6 时，前端展示"你想做哪件事？"的自然选项，不展示 confidence 数字

返回纯 JSON（不要 markdown）：
{ "skillName": "...", "params": {...}, "confidence": 0.0~1.0 }
```

### 2.3 学习菜单动作

用户点击输入框左侧菜单按钮后，前端展示普通学习菜单。菜单项发送结构化 action，不要求用户记忆或输入命令：

| 菜单项 | 说明 | 调用 Skill |
|------|------|------------|
| 开始练习 | 基于当前画像或用户输入开始练习 | `practice` |
| 查看复盘 | 查看最近学习表现 | `review` |
| 复习薄弱点 | 根据历史薄弱点生成新题 | `retry` |
| 换个场景 | 重新推荐或自定义场景 | `scene-select` |
| 保存学习进度 | 登录/注册或保存当前会话 | `onboarding` / 系统操作 |
| 新建学习流 | 归档当前会话并创建新会话；练习中需要确认 | 系统操作 |

登录注册、保存进度、新建学习流、提交答案、会话锁定和历史查看权限属于系统确定性动作。AI 可以解释原因或推荐下一步，但不能绕过系统状态机直接改变主学习流。

### 2.4 路由降级策略

| 情况 | 处理 |
|------|------|
| AI 置信度 < 0.6 | 前端展示 2-3 个自然动作按钮，例如"开始练习 / 查看复盘 / 换场景" |
| AI 路由超时（> 5s） | 降级为 `general-chat`，友好追问用户想继续哪一步 |
| Skill 执行失败 | 展示错误消息 + 重试按钮，错误不丢失上下文 |
| 用户输入内容模糊 | `general-chat` Skill 友好追问澄清意图 |

## 3. 输入框模式

输入框不是固定形态。根据当前激活的 Skill，自动切换模式。

### 3.1 chat 模式（默认）

- 单行输入框，内容多时自动扩展（最大 6 行）
- 占位文案：`"说说你想练什么，或直接回答当前题目..."`
- Enter 发送，Shift+Enter 换行
- 左侧学习菜单按钮，右侧发送按钮；AI 生成中发送按钮变为停止按钮

### 3.2 fill 模式

当 `practice` Skill 出填空题时，输入框切换为填空模式：

```
┌─────────────────────────────────────────┐
│ I would like to _______ a medium steak. │
│                        ↑ 空位高亮        │
│ [ 输入答案...                    ] [✓]  │
└─────────────────────────────────────────┘
```

- 上方显示含空位的句子模板
- 空位用下划线或高亮块标记
- 输入框聚焦在空位，用户只需填词
- 如果是多个空位，Tab 键切换空位

### 3.3 select 模式

当 `scene-select` Skill 展示选项时，或 AI 需要用户确认时：

```
┌─────────────────────────────────────────┐
│ 选择一个场景开始练习：                    │
│                                         │
│  [🍔 餐厅点餐]  [🏫 校园对话]  [✈️ 旅行] │
│  [📝 自定义...]                         │
└─────────────────────────────────────────┘
```

- 输入区变为选项按钮组
- 点击选项直接触发（替代文本输入 + 发送）
- "自定义"选项点击后切换回 chat 模式

### 3.4 menu 模式（学习菜单）

点击输入框左侧菜单按钮时弹出学习菜单：

```
┌────────────────────────────┐
│ 开始练习                    │
│ 查看复盘                    │
│ 复习薄弱点                  │
│ 换个场景                    │
│ 保存学习进度                │
└────────────────────────────┘
```

- 菜单看起来像普通产品操作，不展示斜杠命令
- 点击后发送结构化 action，并由 AI/系统决定下一步
- Esc 或再次点击菜单按钮关闭

## 4. 对话列表与消息类型

### 4.1 历史对话列表

桌面端左侧显示历史对话列表，帮助用户恢复学习上下文：

- 展示 active 会话、最近 archived 会话、标题、最近更新时间、当前 learningState、简短摘要。
- 点击历史会话切换主聊天消息流；当前右侧辅助追问随主会话切换而关闭或恢复对应 thread。
- 支持新建会话和归档当前会话。
- 练习进行中，旧会话默认只读或暂不可进入，避免用户回看答案抄袭；复盘阶段恢复完整历史查看。
- 移动端历史列表收进顶部按钮或底部抽屉，不占用主聊天宽度。

### 4.2 主消息列表

- 从上到下按时间排列，新消息自动滚动到底部
- 支持向上滚动加载历史（分页，每页 50 条）
- 时间分隔：超过 30 分钟的消息间插入时间标签

### 4.3 辅助追问窗口

右侧辅助追问用于针对主聊天中的某条内容建立临时支线，类似旧需求中的辅助解析窗口。用户可以对以下对象打开辅助追问：

| 对象 | 示例 |
|------|------|
| 某句英文 | 解析句子结构 |
| 某个单词 | 解释用法 |
| 某道题 / 错题 | 详细讲错因 |
| 某个语法标签 | 继续追问 |
| 某个推荐答案 | 要求换一种说法 |
| 某个场景卡片 | 扩展更多表达 |

辅助追问启动时必须携带源上下文：

```json
{
  "branchThreadId": "branch_001",
  "conversationId": "conv_001",
  "sourceMessageId": "msg_042",
  "sourceType": "grading-result",
  "sourceSkill": "grade",
  "sourceRef": {
    "exerciseId": "ex_001",
    "lineId": "line_001",
    "errorTags": ["politeness", "article"]
  }
}
```

辅助追问行为：

- 默认调用 `explain` Skill；如果用户追问超出原题上下文，可降级到 `general-chat`。
- 子聊天消息独立持久化，仍然归属于同一个 `conversationId`。
- 子聊天可以连续追问，但不能改变主聊天的 `learningState`、当前题目或主输入模式。
- 如果用户希望切换场景、生成新题或改变练习方向，系统必须回到主学习流展示确认。
- 用户可把辅助追问里的解释插回主聊天，作为一条 `ai-text` 摘要消息保存。

### 4.4 消息类型

| 类型 | 角色 | 说明 |
|------|------|------|
| `system` | system | 系统通知（登录、会话切换、错误） |
| `ai-text` | ai | AI 纯文本回复，流式渲染 |
| `ai-widget` | ai | AI 消息中嵌入 Widget（场景卡片、批改结果等） |
| `user-message` | user | 用户普通消息 |
| `user-answer` | user | 用户答题记录 |
| `branch-message` | user/ai | 右侧辅助追问中的消息，带 `sourceMessageId` |
| `divider` | system | 时间分隔符 |

### 4.5 Widget 渲染

Widget 嵌入在 AI 消息卡片内部，作为消息的富内容区域：

```

所有 Widget 都以 `LearningWidget` 快照持久化，必须包含 `widgetId`、`widgetType`、`widgetData`、`widgetState`、`actions`、`status`、`sourceRef` 和 `createdBySkill`。Widget 的可交互状态只能在 `loading`、`ready`、`disabled`、`submitted`、`expired`、`error` 中切换。
┌─────────────────────────────────┐
│ 🤖 Echo                          │
│                                 │
│ 根据你的情况，推荐以下场景：       │  ← ai-text 部分
│                                 │
│ ┌──────┐ ┌──────┐ ┌──────┐     │
│ │ 🍔   │ │ 🏫   │ │ ✈️   │     │  ← ai-widget 部分
│ │ 餐厅 │ │ 校园 │ │ 旅行 │     │     (scene-cards widget)
│ └──────┘ └──────┘ └──────┘     │
│                                 │
│ [自定义场景...]                  │  ← quick-actions
└─────────────────────────────────┘
```

### 4.6 消息持久化

- 每条消息存储完整内容快照 + streamEvents（用于回放）
- Widget 状态以统一 Widget 快照序列化在消息的 content 中
- 刷新页面后完整恢复对话流和 Widget 状态
- 辅助追问消息记录 `branchThreadId`、`sourceMessageId` 和 `sourceRef`，刷新后可恢复右侧窗口

## 5. 渐进式披露

### 5.1 Skill 发现

用户不被告知有哪些 Skill。Skill 通过以下方式自然呈现：

- **AI 主动引导**：根据用户画像和上下文，AI 主动建议下一步操作
- **快捷按钮**：AI 消息末尾附带 1-3 个快捷操作按钮
- **学习菜单**：输入框左侧按钮提供常用入口，但不暴露内部命令

### 5.2 快捷按钮

每个 AI 回复消息可附带快捷按钮，降低用户输入负担：

| Skill | 典型快捷按钮 |
|-------|-------------|
| `practice` | "跳过" "给点提示" |
| `grade` | "为什么错了？" "再来一道类似的" |
| `review` | "继续练习" "换个场景" |
| `scene-select` | 各场景卡片 + "自定义" |

### 5.3 空状态

首次进入（无历史消息）：AI 自动触发 `onboarding` Skill，引导用户介绍自己。

新建会话（历史消息已归档）：AI 打招呼 + 基于用户画像推荐场景。
