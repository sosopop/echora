# Echora LangGraph 核心引擎重构设计

> 状态:设计设想
> 目标读者:产品 / 后端 / 前端 / AI 编排实现者
> 关联事实源:`doc/prd.md`, `doc/esd.md`, `doc/knowledge/architecture.md`, `doc/knowledge/state-machine.md`, `doc/knowledge/skills.md`

## 1. 背景

Echora 当前已经实现了一个自研 AI Agent 内核:

- `LearningState` 管理学习状态
- `Skill` 封装 onboarding / scene-select / practice / grade / explain / review / retry / general-chat
- `SkillEvent` 通过 SSE 驱动前端流式文本、Widget、输入模式和状态切换
- SQLite 记录消息、练习、批改、错误标签、掌握度和 Agent run

这个结构已经接近 LangGraph 的图式编排模型:状态存在于服务端,节点产生事件,边控制流程推进,持久化用于恢复长流程。继续沿当前方向手写,会逐渐遇到三个问题:

1. 学科扩展后,英语 / 数学 / 语文会复制大量状态推进和异常恢复代码。
2. 多会话 / 跨会话 / 长期学习追踪需要更强的线程、checkpoint、memory 抽象。
3. AI 生成工作流、人工确认、恢复执行、可观察性会越来越像通用 Agent runtime,不适合继续堆在 chat route 和 skill handler 里。

因此建议把 Echora 的核心引擎重构为 **LangGraph 驱动的学习图运行时**。React / Express / SQLite / Widget 协议保留,Echora 的差异化体验仍由自定义 UI 和学习数据模型承载。

## 2. 目标与非目标

### 2.1 目标

- 使用 LangGraph 作为主学习流、辅助追问、复盘、重练和跨学科扩展的核心编排引擎。
- 把当前 `Skill.handler(ctx)` 迁移为 LangGraph node / subgraph。
- 把当前 `LearningState` 映射为图状态字段和路由条件,减少手写状态转移散落。
- 保留现有 `SkillEvent` / Widget 协议,让前端 UI 不被框架绑定。
- 支持长期学习追踪:单会话 thread、跨会话 learner memory、跨学科 mastery profile。
- 支持未来由 AI 生成或改写部分学习图定义,但所有生成内容必须经过 schema、权限和状态校验。

### 2.2 非目标

- 不改成 Dify / Flowise 这种平台托管 UI。
- 不让 LangGraph 直接决定鉴权、数据库权限、会话锁定等安全规则。
- 不把 Widget 渲染逻辑塞进 LangGraph。图只产出结构化事件,React 继续负责渲染。
- 不一次性重写全站。推荐通过适配层渐进迁移。

## 3. 推荐总体架构

```text
React Chat UI
  -> API client
  -> Express chat routes
  -> EchoraGraphRuntime
       -> LangGraph main graph
          -> subject router
          -> onboarding subgraph
          -> learning session subgraph
          -> grading subgraph
          -> review / retry subgraph
          -> branch follow-up subgraph
       -> Event adapter: Graph update -> SkillEvent
       -> Checkpoint / memory adapter
  -> SQLite services
  -> SSE stream event source
```

分层原则:

- **LangGraph**:负责流程编排、节点执行、条件边、暂停/恢复、checkpoint。
- **Express routes**:负责 HTTP 输入输出、鉴权、幂等、错误映射和 SSE 生命周期。
- **Domain services**:负责数据库写入、练习记录、批改记录、掌握度更新、会话锁定。
- **React**:负责聊天界面、Widget 渲染、输入模式、历史会话和辅助追问面板。
- **shared/**:继续定义跨层 DTO、Widget schema、事件协议和公共类型。

## 4. 核心概念映射

| 当前概念 | LangGraph 重构后 | 说明 |
|---|---|---|
| `Skill` | Node 或 Subgraph | 小能力仍可独立测试,但由图调度 |
| `SkillRegistry` | Graph registry | 按学科、场景和能力注册图 |
| `LearningState` | `GraphState.learningState` + 条件边 | 状态仍是产品事实,图负责推进 |
| `SkillEvent` | 图事件输出协议 | 保留现有前端消费方式 |
| `conversation_id` | LangGraph thread id 映射 | 一个主会话对应一个 graph thread |
| `branch_thread_id` | 独立 branch graph thread | 支线追问不改变主线状态 |
| `agent_runs` | Graph run trace | 记录 node、edge、耗时、错误和 traceId |
| `stream_events` | Graph event transcript | SSE replay 的事实源仍落库 |
| `mastery_records` | Long-term learner memory | 跨会话 / 跨学科追踪 |

## 5. GraphState 设计

LangGraph 的核心状态建议分为 6 个区域。

```ts
interface EchoraGraphState {
  identity: {
    userId: number;
    conversationId: number;
    branchThreadId?: number;
    traceId: string;
  };

  learning: {
    subject: 'english' | 'math' | 'chinese';
    learningState:
      | 'onboarding'
      | 'scene_selecting'
      | 'practicing'
      | 'grading'
      | 'awaiting_next'
      | 'reviewing'
      | 'archived';
    activeSkill: string | null;
    inputMode: 'chat' | 'fill' | 'select' | 'menu';
    lockPolicy: 'locked' | 'open';
  };

  profile: {
    name?: string;
    age?: number;
    grade?: string;
    level?: string;
    preferences?: Record<string, unknown>;
  };

  session: {
    currentSceneId?: string;
    currentAttemptId?: number;
    stage?: number;
    questionNo?: number;
    retryCount?: number;
    lastUserText?: string;
    selectedAction?: string;
  };

  memory: {
    recentMessagesSummary?: string;
    subjectMasterySummary?: string;
    weakTags: string[];
    recentTopics: string[];
  };

  ui: {
    pendingEvents: SkillEventInput[];
    activeWidgets: LearningWidgetInstance[];
    quickActions: QuickAction[];
  };
}
```

设计要点:

- `ui.pendingEvents` 是图节点产出的临时事件队列,由 adapter 持久化并清空。
- `learning.learningState` 仍和 PRD 对齐,避免产品语义被框架吞掉。
- `memory` 只放摘要和索引,权威学习记录仍在结构化表。
- `subject` 是跨学科扩展入口,不是把所有学科混在一条硬编码分支里。

## 6. 图拓扑设计

### 6.1 顶层图

```text
START
  -> load_context
  -> classify_input
  -> guard_policy
  -> route_by_subject
  -> subject_subgraph
  -> persist_side_effects
  -> emit_events
  -> END
```

节点职责:

- `load_context`:加载用户、会话、画像、最近消息、当前题、掌握度摘要。
- `classify_input`:识别自由文本、结构化 action、Widget submit、停止生成、难度反馈。
- `guard_policy`:执行鉴权、锁定、归档只读、重复提交、非法状态动作校验。
- `route_by_subject`:路由到英语 / 数学 / 语文学习子图。
- `subject_subgraph`:执行学科内学习流程。
- `persist_side_effects`:统一落库消息、练习、批改、掌握度、事件流和 trace。
- `emit_events`:把图输出转为 SSE 可 replay 的 `SkillEvent`。

### 6.2 英语学习子图

```text
english_entry
  -> onboarding?
  -> scene_selecting?
  -> practice?
  -> grade?
  -> review?
  -> retry?
  -> explain?
  -> general_chat?
  -> english_exit
```

当前 8 个 Skill 可以这样迁移:

- `onboarding`:变成 `collect_profile_node` + `validate_profile_node` + `recommend_scene_node`
- `scene-select`:变成 `generate_scene_pool_node` + `rank_scene_cards_node` + `select_scene_node`
- `practice`:变成 `generate_dialogue_node` + `next_question_node` + `render_exercise_widget_node`
- `grade`:变成 `grade_answer_node` + `update_mastery_node` + `auto_next_node`
- `explain`:变成 branch subgraph 中的 `explain_source_node`
- `review`:变成 `aggregate_learning_records_node` + `render_progress_summary_node`
- `retry`:变成 `select_weakness_node` + `generate_retry_question_node`
- `general-chat`:保留为低风险兜底节点,但由 `guard_policy` 限制不能在 `practicing` / `grading` 中替代主线

### 6.3 辅助追问子图

```text
branch_start
  -> load_source_ref
  -> redact_if_locked
  -> answer_follow_up
  -> maybe_mark_for_review
  -> branch_end
```

约束:

- 独立 thread,不写主线 `learningState`。
- 答题未提交前不能泄露标准答案。
- “加入复盘”必须经过显式 action,由 domain service 幂等写入统计。

### 6.4 跨学科扩展

顶层图不关心具体题型,只识别通用学习动作:

- 开始学习
- 选择主题 / 场景 / 知识点
- 提交答案
- 批改
- 追问
- 复盘
- 重练
- 调整难度

每个学科用独立 subgraph:

```text
subject_subgraphs/
  english_graph
  math_graph
  chinese_graph
```

英语强调场景对话和表达错误标签;数学强调知识点、解题步骤、公式和过程评分;语文强调阅读材料、作文片段、修辞和结构点评。它们共享:

- 用户画像
- mastery_records 抽象
- SkillEvent / Widget envelope
- 会话锁定规则
- 复盘和重练入口

## 7. Widget 与事件协议

建议保留当前 `SkillEventInput` 9 类型,并把 LangGraph node 输出适配为这些事件。

```text
Graph node output
  -> GraphEventAdapter
  -> SkillEventInput[]
  -> append seq / streamId / timestamp
  -> messages.stream_events
  -> streamBus / SSE
  -> useChatStore
```

Widget 不应由 LangGraph 绑定 React 组件,只产出:

```json
{
  "id": "exercise-card-123",
  "type": "exercise-card",
  "status": "ready",
  "data": {},
  "version": 1
}
```

未来跨学科 Widget 可以扩展:

- `math-solution-steps`
- `formula-input`
- `geometry-canvas`
- `reading-passage`
- `essay-feedback`
- `knowledge-map`

但 envelope 不变,前端通过 `WidgetRenderer` 注册新组件。

## 8. 持久化与长期记忆

### 8.1 Thread / checkpoint 映射

建议新增映射表:

```sql
CREATE TABLE graph_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  branch_thread_id INTEGER,
  graph_name TEXT NOT NULL,
  provider_thread_id TEXT NOT NULL,
  checkpoint_namespace TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

说明:

- `conversation_id` 仍是产品会话 ID。
- `provider_thread_id` 对应 LangGraph thread。
- branch 追问可以有独立 graph thread,但仍指向源会话。

### 8.2 学习长期记忆

保留现有结构化学习表,并抽象为跨学科:

- `mastery_records`:增加 `subject`, `skill_key`, `dimension`
- `error_tag_events`:扩展为 `learning_signal_events`
- `scene_dialogues`:英语专属,未来数学 / 语文增加各自内容表

长期记忆分三层:

1. **消息层**:聊天历史和 Widget snapshot,用于 UI 恢复。
2. **学习记录层**:attempt / grading / mastery,用于复盘和推荐。
3. **摘要层**:用户跨会话画像、近期薄弱点和长期偏好,用于注入 graph state。

## 9. AI 生成工作流的边界

未来可以让 AI 生成“学科学习图”或“知识点训练流程”,但不能直接生成可执行任意代码。推荐引入 Echora Workflow DSL:

```yaml
name: english_scene_practice_v1
subject: english
states:
  - scene_selecting
  - practicing
  - grading
nodes:
  - id: generate_question
    type: llm
    outputSchema: exercise-card
  - id: grade_answer
    type: llm-with-rubric
    outputSchema: grading-result
edges:
  - from: generate_question
    to: grade_answer
    when: user_submits_answer
guards:
  - practicing_cannot_reveal_answer_before_submit
  - archived_is_readonly
```

编译链路:

```text
AI generated DSL
  -> zod schema validation
  -> policy validation
  -> graph compiler
  -> LangGraph subgraph
  -> sandbox smoke tests
  -> enable for subject / cohort
```

硬边界:

- AI 可生成节点描述、rubric、prompt、边条件草案。
- 系统拥有最终 guard、权限、数据写入和 Widget schema 校验权。
- 任何会影响学习记录、掌握度、锁定状态的动作必须走 domain service。

## 10. 渐进迁移方案

### 阶段 0: 适配层验证

目标:不改前端,新增 `EchoraGraphRuntime` 包装当前 Skill。

- 新增 `server/graph/`。
- 把当前 `Skill.handler` 包装为 LangGraph node。
- 仍输出现有 `SkillEventInput`。
- 选一个低风险流程,例如 `review` 或 `general-chat`,先迁移。

验收:

- 前端无感。
- 现有 SSE replay 不变。
- `npm run test:server` 和相关 smoke 通过。

### 阶段 1: 主学习图迁移

目标:把 route + skillRegistry 的调度迁移到 LangGraph。

- `POST /api/chat/send` 调用 graph runtime。
- `LearningState` 转移改由 graph node 输出,route 只执行落库副作用。
- `onboarding -> scene_selecting -> practice -> grade` 形成一条主图。

验收:

- 新用户到第一题流程通过。
- 四阶段练习、自动下一题、难度反馈和 replacement remediation 通过。

### 阶段 2: 支线追问和长期 memory

目标:branch follow-up 使用独立 branch graph thread。

- `branch_threads` 映射到 graph thread。
- 锁定态 redaction 进入 branch subgraph。
- “加入复盘”成为 branch graph 的受控 action。

验收:

- 主线状态不被支线改变。
- 锁定态不泄露答案。
- 加入复盘幂等写统计。

### 阶段 3: 跨学科能力

目标:新增数学或语文 subgraph,验证学科可扩展性。

- 抽象 `subject`, `skill_key`, `mastery dimension`。
- 新增学科 Widget。
- 新增 subject router。

验收:

- 英语现有流程不回退。
- 新学科可独立 onboarding / practice / grade / review。

### 阶段 4: AI 生成 DSL

目标:让 AI 生成受限 workflow DSL,再编译为 subgraph。

- 定义 DSL schema。
- 提供静态校验和策略校验。
- 生成测试用例和 sandbox run。

验收:

- AI 生成的流程不能绕过 guard。
- 生成流程可回滚、可禁用、可追踪。

## 11. 风险与控制

| 风险 | 影响 | 控制方式 |
|---|---|---|
| 框架引入后复杂度上升 | 调试门槛增加 | 先包装现有 Skill,不要大爆炸重写 |
| LangGraph checkpoint 与现有 SQLite 事件源重复 | 状态事实源混乱 | 明确:checkpoint 恢复执行,SQLite 是产品记录和 UI replay |
| AI 生成流程绕过业务规则 | 安全和学习数据污染 | DSL + policy validator + domain service gate |
| 跨学科抽象过早 | 英语流程被过度泛化 | 第一阶段只抽通用事件和 mastery,题型保留学科内 |
| 前端 Widget 被框架反向绑定 | UI 迭代受限 | Graph 只产出 envelope,React 组件注册仍自有 |

## 12. 推荐技术落点

新增目录建议:

```text
server/
  graph/
    runtime.ts
    state.ts
    events.ts
    guards.ts
    checkpoints.ts
    graphs/
      rootGraph.ts
      englishGraph.ts
      branchGraph.ts
    nodes/
      loadContext.ts
      classifyInput.ts
      guardPolicy.ts
      emitWidget.ts
      persistEffects.ts
```

共享类型建议:

```text
shared/
  graph.ts          # GraphState DTO, node output DTO
  workflowDsl.ts    # AI 可生成 DSL schema
```

测试建议:

- graph node 单测:不启动 Express,直接给 state,断言事件和 next state。
- route 集成测试:验证 graph runtime 接入后 HTTP 行为不变。
- smoke:注册 -> onboarding -> 场景 -> 练习 -> 批改 -> SSE replay。

## 13. 决策建议

推荐采用 **LangGraph 作为核心编排引擎 + Echora 自有 UI / 数据 / Widget 协议** 的混合架构。

理由:

- Echora 的核心价值在自定义学习体验和长期学习数据,不应交给通用聊天平台托管。
- LangGraph 与当前 SkillEvent / LearningState 模型契合度高,迁移成本可控。
- 未来扩展数学、语文时,可以用 subject subgraph 扩展,避免复制整套手写状态逻辑。
- AI 生成工作流可以落在受限 DSL 上,既减少人工编码,又保留安全边界。

一句话版本:

> 让 LangGraph 负责“学习过程如何推进”,让 Echora 继续负责“学习产品如何被用户看见、记录和保护”。

