# 08. AI 工作流与 Widget 契约

## 1. 目标

本文是 V1 MVP 的实现基准，用来把"AI 会话流式学习"收敛成可落地的状态机、系统动作边界、Widget 协议和结构化学习记录。

核心原则：

- 主学习流只有一条，承载 onboarding、场景选择、练习、批改、复盘和重练。
- AI 负责内容生成、解释、推荐和调度建议；系统负责确定性动作、权限、保存、锁定和状态转换。
- Widget 是对话中的功能界面，必须有统一协议、生命周期、动作输出和持久化规则。
- 辅助追问是临时支线，只解释源上下文，不改变主学习流状态。

## 2. 全局学习流状态机

### 2.1 状态定义

| 状态 | 说明 | 允许的主要输入 |
|------|------|----------------|
| `onboarding` | 收集或补全用户画像 | 自然回答、跳过、保存账号 |
| `scene_selecting` | 推荐场景或等待用户自定义场景 | 选择场景、自定义描述、换一批 |
| `practicing` | 正在出题或等待用户答题 | 提交答案、提示、跳过、辅助追问 |
| `grading` | 正在批改用户答案 | 等待批改完成、停止生成、重试 |
| `awaiting_next` | 批改完成，等待下一步 | 下一题、类似题、换场景、复盘 |
| `reviewing` | 展示一轮或历史复盘 | 继续练习、重练薄弱点、查看历史 |
| `archived` | 历史会话，不再作为当前主线 | 只读查看、复制摘要、新建学习流 |

### 2.2 合法流转

```text
onboarding
  → scene_selecting
  → practicing
  → grading
  → awaiting_next
  → practicing | scene_selecting | reviewing
  → archived
```

补充规则：

- `reviewing` 可回到 `scene_selecting` 或 `practicing`，系统可自动创建新学习流。
- `grading` 期间不得切换主线状态；用户可打开辅助追问，但主线仍等待批改完成。
- `archived` 会话不可继续答题；如用户想基于历史继续练，系统创建新的 active 会话并引用历史摘要。
- 每个用户最多一个 `active` 会话，active 会话必须处于上述非 `archived` 状态之一。

## 3. AI 决策与系统确定动作

### 3.1 AI 可决定的内容

- 推荐场景、解释推荐理由、生成题目、生成参考答案。
- 批改说明、错误标签建议、鼓励语、下一题建议。
- 复盘总结、薄弱点解释、重练方向。
- 在用户输入模糊时，提出 2-3 个自然的下一步选项。

### 3.2 系统必须确定执行的动作

- 登录、注册、登出、保存学习进度。
- 新建、归档、锁定、解锁、恢复会话。
- 提交答案、记录尝试、写入批改结果和错误标签事件。
- 权限判断、会话防抄袭、历史答案隐藏。
- Widget action 的安全校验和状态转换。

### 3.3 学习菜单处理

学习菜单发送结构化 action。系统先校验当前状态是否允许该 action，再决定是否直接执行、交给 AI 生成内容，或展示确认 Widget。

| 菜单 action | 系统处理 | 可能进入的状态 |
|-------------|----------|----------------|
| `start_practice` | 若已有场景则开始练习，否则请求 AI 推荐场景 | `practicing` / `scene_selecting` |
| `show_review` | 读取结构化记录，交给 AI 生成复盘 | `reviewing` |
| `retry_weakness` | 读取薄弱点索引，生成重练题 | `practicing` |
| `change_scene` | 结束当前等待状态或确认中断后换场景 | `scene_selecting` |
| `save_progress` | 若未登录则展示账号入口，否则保存当前会话 | 当前状态不变 |
| `new_flow` | 归档当前会话并创建新会话；练习中需确认 | `onboarding` / `scene_selecting` |

## 4. 会话锁定与防抄袭

### 4.1 锁定规则

- 当 active 会话处于 `practicing` 或 `grading`，历史会话仍可出现在左侧列表。
- 历史会话中的用户答案、参考答案、批改详情默认隐藏或只读折叠，直到当前题完成。
- 当前题完成后进入 `awaiting_next` 或 `reviewing`，历史详情恢复可见。
- `archived` 会话永远不可继续答题，只能复盘或引用为新学习流的上下文。

### 4.2 UI 表达

- 历史列表显示："暂不可查看答案，完成当前题后解锁"。
- 隐藏内容使用 `conversation-lock` Widget 或等价状态组件表达。
- 锁定是系统规则，不由 AI 决定；AI 只能解释为什么暂时不可查看。

## 5. 辅助追问规则

### 5.1 源上下文

辅助追问必须从主学习流中的源对象打开：

| sourceType | 示例 | sourceRef 必填 |
|------------|------|----------------|
| `message` | 某条 AI 解释 | `messageId` |
| `exercise` | 当前题目 | `exerciseAttemptId` / `messageId` |
| `grading` | 批改结果 | `gradingResultId` / `errorTags` |
| `widget` | 场景卡片、复盘摘要 | `widgetId` / `widgetType` |
| `tag` | 某个语法标签 | `tag` / `relatedAttemptIds` |

### 5.2 行为边界

- 辅助追问可以连续追问、解释、举例、改写表达。
- 辅助追问消息可被持久化，并关联到同一个 `conversationId`。
- 辅助追问默认不写入错误标签统计；只有用户点击"加入复盘"或系统明确标记为学习事件时，才写入 `error_tag_events`。
- 辅助追问不能直接切换主学习流状态，不能直接生成下一题，不能替用户提交答案。
- 如果用户在辅助追问里要求"再来一道"，系统必须在主学习流展示确认后再执行。

## 6. Widget 统一协议

### 6.1 基础结构

```ts
interface LearningWidget {
  widgetId: string;
  widgetType: WidgetType;
  widgetData: Record<string, unknown>;
  widgetState: Record<string, unknown>;
  actions: WidgetAction[];
  status: WidgetStatus;
  sourceRef?: SourceRef;
  createdBySkill: string;
}

type WidgetStatus =
  | 'loading'
  | 'ready'
  | 'disabled'
  | 'submitted'
  | 'expired'
  | 'error';

interface WidgetAction {
  action: string;
  label: string;
  payload?: Record<string, unknown>;
  affectsMainFlow: boolean;
}
```

### 6.2 生命周期

| 状态 | 含义 |
|------|------|
| `loading` | Widget 容器已出现，数据仍在生成 |
| `ready` | 用户可交互 |
| `disabled` | 当前状态不允许交互，但内容可见 |
| `submitted` | 用户已提交，等待系统或 AI 后续处理 |
| `expired` | 历史 Widget 已过期，不再接受 action |
| `error` | 生成或交互失败，可展示重试 |

### 6.3 V1 Widget 清单

| Widget | 用途 | 典型 action | 持久化 | 影响主线 |
|--------|------|-------------|--------|----------|
| `scene-cards` | 推荐 3-5 个场景 | `select_scene`, `custom_scene` | 是 | 是 |
| `exercise-card` | 承载题干、题型、目标表达 | `submit_answer`, `hint`, `skip` | 是 | 是 |
| `fill-blank` | 填空输入区域 | `submit_answer` | 是 | 是 |
| `choice-question` | 选择题或选择填空 | `submit_choice` | 是 | 是 |
| `grading-result` | 批改、分数、参考答案、错因 | `open_follow_up`, `retry_similar`, `next` | 是 | 是 |
| `progress-summary` | 一轮或历史复盘摘要 | `continue`, `retry_weakness`, `change_scene` | 是 | 是 |
| `answer-review` | 复盘中逐题查看答案和批改 | `open_follow_up` | 是 | 否 |
| `intent-confirm` | 用户意图不明确时确认下一步 | `confirm_intent` | 是 | 是 |
| `learning-menu` | 输入框左侧学习菜单 | `start_practice`, `show_review`, `save_progress` | 否 | 视 action 而定 |
| `account-gate` | 登录、注册、保存进度提示 | `login`, `register`, `save_later` | 是 | 视 action 而定 |
| `follow-up-source` | 辅助追问来源卡片 | `insert_summary_to_main` | 是 | 默认否 |
| `conversation-lock` | 历史答案/批改锁定提示 | `finish_current`, `view_summary_only` | 是 | 否 |

## 7. 结构化学习记录

### 7.1 主记录

`messages` 继续作为完整学习流和 UI 回放记录。

### 7.2 轻量索引表

为复盘、重练、薄弱点统计和防抄袭保留结构化索引：

| 表 | 作用 |
|----|------|
| `exercise_attempts` | 每次题目、用户答案、题型、状态、关联消息 |
| `grading_results` | 分数、是否正确、参考答案、修正点、关联 attempt |
| `error_tag_events` | 每个错误标签事件，支持聚合薄弱点 |

这些表不替代消息流，只为查询和统计服务。

## 8. 验收基准

- 每个 Skill 必须声明可进入和可离开的学习流状态。
- 每个 Widget 必须符合统一协议，并声明 action 是否影响主线。
- `review` 和 `retry` 必须从结构化索引表读取数据，不允许只解析自然语言消息。
- 会话锁定、防抄袭、登录保存、新建会话必须由系统确定执行。
- 辅助追问不能直接改变主学习流状态。
