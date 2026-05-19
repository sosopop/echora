# 学习流、状态切换与 AI 路由概览

## 一、学习状态机（7 个状态）

```
onboarding ──→ scene_selecting ──→ practicing ──→ grading ──→ awaiting_next
                                   ↑    ↑           │          │        │
                                   │    └───────────┘          │        │
                                   │   (next question)         │        │
                                   │                           │        ↓
                                   └───────────────────────────┘   reviewing ──→ archived
                                      (retry / change scene)
```

**状态定义** (`shared/skill.ts`):

| 状态 | 含义 | 锁定对话 |
|---|---|---|
| `onboarding` | 新用户引导，收集昵称/目标/难度 | 否 |
| `scene_selecting` | 选择学习场景（餐厅/机场等） | 否 |
| `practicing` | 做题中（4 个子阶段） | **是** |
| `grading` | LLM 批改中 | **是** |
| `awaiting_next` | 等待用户选择下一步 | 否 |
| `reviewing` | 复习/复盘 | 否 |
| `archived` | 归档（只读） | 否 |

**状态由谁切换**：不是中央状态机，而是 Skill 通过 `state-transition` 事件驱动。聊天路由收到该事件后写入 `conversations` 表。

---

## 二、练习的 4 个子阶段

`practicing` 状态内部有 4 个阶段（`practiceFsm.ts` 管理）：

| 阶段 | 名称 | 题型 |
|---|---|---|
| 1 | fill_word | 从对话中选词填空 |
| 2 | sentence_translation | 中译英整句 |
| 3 | dialogue_chain | 续写对话 |
| 4 | role_reversal | 用户扮演角色 |

每阶段题量由难度决定：A1/A2 = 5 题，B1/B2 = 8 题，C1/C2 = 10 题。

---

## 三、8 个 Skill 及其触发状态

| Skill | 允许的状态 | 用途 | 是否调 LLM |
|---|---|---|---|
| `onboarding` | onboarding | 收集用户信息 | 是 |
| `scene-select` | scene_selecting, awaiting_next, reviewing, practicing | 展示场景卡片、生成对话 | 是 |
| `practice` | scene_selecting, practicing, awaiting_next | 出题 | 否（模板提取） |
| `grade` | practicing, grading | 批改答案 | 是 |
| `explain` | practicing, grading, awaiting_next, reviewing, scene_selecting | 解释答案 | 是 |
| `review` | awaiting_next, reviewing, scene_selecting, archived | 进度复盘 | 否（数据聚合） |
| `retry` | awaiting_next, reviewing, scene_selecting, practicing | 针对性补练 | 是 |
| `general-chat` | 任意（`[]`） | 自由对话/意图确认 | 是 |

---

## 四、AI 路由：两层决策

用户发消息后，路由分两层：

### 第一层：确定性预路由（绕过 LLM）

`normalizeChatSendInput()` 按优先级匹配，命中则直接决定 Skill：

```
1. Widget 结构化动作（点击按钮） → 直接映射到对应 Skill
2. onboarding 状态下的任何文本   → onboarding
3. "复习"/"总结"               → review
4. "重做"/"再练"               → retry
5. "太难"/"简单点"             → scene-select（调难度）
6. "下一个"/"换场景"           → 控制动作
7. "为什么"/"解释"             → explain
8. practicing 状态下的普通文本   → 自动包装为 submit-answer
```

### 第二层：LLM 路由（未命中确定性规则时）

```
用户文本 + 当前状态 + 可用 Skill 列表
    → provider.route() （强制 tool_use 输出 JSON）
    → 得到 { skillName, confidence, params }
    → 校验 Skill 存在 + 状态允许
    → 通过 → 执行该 Skill
```

**后处理规则**：
- `practicing`/`grading` 状态下 LLM 返回 `general-chat` → 拒绝（400 错误），防止打断做题
- confidence < 0.5 且处于空闲状态 → 改为 `general-chat` + `intent-confirm` widget，让用户确认意图

---

## 五、Skill 事件循环（端到端）

```
用户发消息
  ↓
POST /api/chat/send
  ↓
确定性预路由 ──命中──→ RouterDecision
  │ (未命中)
  ↓
aiRouter.decide() ──→ LLM route() ──→ RouterDecision
  ↓
校验 Skill + 状态
  ↓
创建 assistant 消息 + agent_run 记录
  ↓
后台启动 skill.handler(ctx)（异步生成器）
  ↓
for await (event of handler) {
    ① 赋予 seq/streamId/timestamp
    ② 写入 messages.stream_events（持久化）
    ③ 处理副作用（state-transition → 更新学习状态，mode-switch → 更新输入模式）
    ④ 发布到 streamBus（实时推送）
}
  ↓
SSE GET /api/chat/stream
  ├─ 回放已持久化的事件
  ├─ 订阅 streamBus 实时事件
  └─ 轮询 DB（300ms）兜底跨实例事件
  ↓
前端 useChatStore 消费事件
  ├─ text-chunk → 累积到 streamBuffer
  ├─ widget-* → 更新 activeWidgets
  └─ done/error → 结束流
```

### 事件类型速查

| 类型 | 作用 | 副作用 |
|---|---|---|
| `text-chunk` | LLM 文本增量 | 累积到消息内容 |
| `widget-init/update/ready` | Widget 生命周期 | 写入 widget_snapshot |
| `mode-switch` | 切换输入模式 | 更新 input_mode |
| `quick-actions` | 推送快捷按钮 | 仅前端 |
| `state-transition` | 学习状态切换 | 更新 learning_state + lock_policy |
| `done` | 流结束 | 标记 agent_run 完成 |
| `error` | 错误 | 标记 agent_run 失败 |

---

## 六、关键设计决策

1. **无降级**：LLM 路由失败直接抛错（502），不静默降级到 general-chat，确保问题可见。
2. **状态由 Skill 驱动**：没有中央状态机对象，Skill yield `state-transition` 事件，路由层负责持久化。
3. **事件是唯一真相源**：Skill handler 不直接写 DB，所有输出通过事件流，由路由层统一持久化 + 广播。
4. **确定性优先**：高频操作（答题、复习、重做）走规则匹配，只有模糊意图才走 LLM 路由，减少延迟和成本。
