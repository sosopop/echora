# 05. 技术架构

## 1. 技术选型

| 层级 | 选型 | 说明 |
|------|------|------|
| 前端 | Vue 3 + TypeScript + Vite | SPA，核心是聊天视图 + Widget 渲染器 |
| 状态管理 | Pinia | conversation、learningFlow、stream、widgetRegistry、userProfile |
| 内部流式通信 | EventSource (SSE) | 接收 AI 流式输出 + Skill 事件；该术语不出现在用户界面 |
| 后端 | Node.js + Express 5 + TypeScript | REST + 内部流式接口 |
| 数据库 | SQLite + better-sqlite3 | V1 单机足够 |
| 校验 | Zod | API 入参 + Skill 输入/输出 schema + AI 输出 |
| 鉴权 | JWT + bcryptjs | 注册登录 |
| AI | Provider 抽象层 | 支持流式输出、多 provider 切换 |

## 2. Skills 插件架构（核心）

### 2.1 架构概览

```text
┌─────────────────────────────────────────────────────┐
│                     ChatView.vue                      │
│  ┌──────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│  │Conversation  │ │   MessageList   │ │ FollowUp     │ │
│  │HistoryPanel  │ │ + WidgetRenderer│ │ Panel        │ │
│  └──────────────┘ └───────┬─────────┘ └──────┬───────┘ │
│                           │                  │         │
│                    ┌──────▼──────────────────▼──────┐ │
│                    │ ChatInput / FollowUpInput        │ │
│                    │ mode: chat/fill/select/menu      │ │
│                    └──────────────────────────────────┘ │
│         ↕                                              │
│  ┌──────────────────────────────────────────────────┐ │
│  │ stores/conversation.ts / conversation-list.ts       │ │
│  │ stores/stream.ts / follow-up.ts                    │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
         ↕ Internal stream + REST
┌─────────────────────────────────────────────────────┐
│                    Express Server                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │              AI Router                           │ │
│  │  user input → AI intent detection → skillName    │ │
│  └───────────────────┬─────────────────────────────┘ │
│                      ↓                                │
│  ┌─────────────────────────────────────────────────┐ │
│  │            Skill Registry                        │ │
│  │  skillName → Skill { handler, widget, mode }     │ │
│  └───────────────────┬─────────────────────────────┘ │
│                      ↓                                │
│  ┌─────────────────────────────────────────────────┐ │
│  │            Skill Handler                         │ │
│  │  AsyncIterable<SkillEvent> → internal stream     │ │
│  └───────────────────┬─────────────────────────────┘ │
│                      ↓                                │
│  ┌─────────────────────────────────────────────────┐ │
│  │            AI Service (Provider)                  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

后端在 AI Router 之前增加确定性系统层：`LearningFlowService` 负责状态机与会话锁定，`SystemActionService` 负责登录、保存、新建会话、提交答案和权限判断，`WidgetRegistry` 负责 Widget schema 与 action 校验。AI 只给出内容和调度建议，不能直接绕过这些系统服务改写主学习流。

### 2.2 Skill 定义（共享类型）

```ts
// shared/skill-types.ts
export interface Skill {
  name: string;
  description: string;
  triggerKeywords: string[];
  allowedStates: LearningState[];
  nextStates?: LearningState[];
  inputSchema: Zod.ZodSchema;
  handler: (ctx: SkillContext) => AsyncIterable<SkillEvent>;
  widgetType?: WidgetType;
  inputMode?: InputMode;
}

export interface SkillContext {
  userId: string;
  conversationId: string;
  learningState: LearningState;
  userProfile: UserProfile;
  recentMessages: Message[];
  params: Record<string, unknown>;
  sourceRef?: SourceRef;
}

export type InputMode = 'chat' | 'fill' | 'select' | 'menu';
export type LearningState =
  | 'onboarding'
  | 'scene_selecting'
  | 'practicing'
  | 'grading'
  | 'awaiting_next'
  | 'reviewing'
  | 'archived';

export type SkillEvent =
  | { type: 'text-chunk'; data: string }
  | { type: 'widget-init'; widgetType: string }
  | { type: 'widget-update'; field: string; data: unknown }
  | { type: 'widget-ready' }
  | { type: 'mode-switch'; mode: InputMode }
  | { type: 'quick-actions'; actions: QuickAction[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface QuickAction {
  label: string;
  action: string;
  payload?: unknown;
  affectsMainFlow?: boolean;
}
```

### 2.3 Skill 实现示例

```ts
// server/skills/scene-select.ts
export const sceneSelectSkill: Skill = {
  name: 'scene-select',
  description: '根据用户画像推荐 3-5 个英语练习场景，用户可选择或自定义场景',
  triggerKeywords: ['场景', '选场景', '换个场景', '练什么', '有什么'],
  inputSchema: z.object({
    scenarioHint: z.string().optional(),
  }),
  allowedStates: ['onboarding', 'awaiting_next', 'reviewing'],
  nextStates: ['scene_selecting', 'practicing'],
  widgetType: 'scene-cards',
  inputMode: 'select',

  async *handler(ctx) {
    // 1. 用 AI 生成个性化场景推荐
    const scenes = await aiService.generateSceneSuggestions(ctx.userProfile);

    // 2. 流式输出
    yield { type: 'text-chunk', data: '根据你的情况，推荐这几个场景：' };
    yield { type: 'widget-init', widgetType: 'scene-cards' };

    for (let i = 0; i < scenes.length; i++) {
      yield { type: 'widget-update', field: `scenes[${i}]`, data: scenes[i] };
    }

    yield { type: 'widget-ready' };
    yield { type: 'mode-switch', mode: 'select' };
    yield { type: 'quick-actions', actions: [
      { label: '✨ 随便来一个', action: 'random_scene' },
      { label: '📝 自定义场景', action: 'custom_scene' },
    ]};
    yield { type: 'done' };
  }
};
```

### 2.4 Skill Registry

```ts
// server/skills/registry.ts
class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill) {
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getDescriptionsForAI(): string {
    return Array.from(this.skills.values())
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }
}

export const skillRegistry = new SkillRegistry();
```

### 2.5 前端 Widget 渲染器

```ts
// src/components/chat/WidgetRenderer.vue
// 根据 widgetType 动态加载对应的 Widget 组件

const widgetMap: Record<string, Component> = {
  'scene-cards': () => import('./widgets/SceneCardsWidget.vue'),
  'exercise-card': () => import('./widgets/ExerciseCardWidget.vue'),
  'fill-blank': () => import('./widgets/FillBlankWidget.vue'),
  'choice-question': () => import('./widgets/ChoiceQuestionWidget.vue'),
  'grading-result': () => import('./widgets/GradingResultWidget.vue'),
  'progress-summary': () => import('./widgets/ProgressSummaryWidget.vue'),
  'answer-review': () => import('./widgets/AnswerReviewWidget.vue'),
  'intent-confirm': () => import('./widgets/IntentConfirmWidget.vue'),
  'learning-menu': () => import('./widgets/LearningMenuWidget.vue'),
  'account-gate': () => import('./widgets/AccountGateWidget.vue'),
  'follow-up-source': () => import('./widgets/FollowUpSourceWidget.vue'),
  'conversation-lock': () => import('./widgets/ConversationLockWidget.vue'),
};

// Widget 组件接收的 props:
// - widgetData: 来自消息的 content.widgetData
// - widgetState: 来自消息的 widgetState（交互状态）
// - status: loading/ready/disabled/submitted/expired/error
// - actions: 经过 schema 校验的 WidgetAction[]
// - onAction: 用户交互回调（点击场景、选择选项等）
```

## 3. 前端架构

### 3.1 路由（极简）

```ts
const routes = [
  { path: '/', component: ChatView, meta: { requiresAuth: true } },
  { path: '/login', component: LoginView },
  { path: '/register', component: RegisterView },
];
```

### 3.2 组件树

```text
App.vue
├── LoginView.vue / RegisterView.vue
└── ChatView.vue
    ├── ConversationHistoryPanel.vue
    ├── TopBar.vue
    ├── MessageList.vue
    │   ├── SystemMessage.vue
    │   ├── AiTextMessage.vue
    │   ├── AiWidgetMessage.vue
    │   │   └── WidgetRenderer.vue
    │   │       ├── SceneCardsWidget.vue
    │   │       ├── GradingResultWidget.vue
    │   │       ├── ProgressSummaryWidget.vue
    │   │       └── ...
    │   ├── UserMessage.vue
    │   └── DividerMessage.vue
    ├── FollowUpPanel.vue
    │   ├── FollowUpSourceCard.vue
    │   ├── FollowUpMessageList.vue
    │   └── FollowUpInput.vue
    └── ChatInput.vue
        └── LearningMenuPanel.vue
```

### 3.3 Stores

| Store | 职责 |
|-------|------|
| `auth` | JWT、用户信息、登录/注册/登出 |
| `conversation` | 当前会话 ID、消息列表、发送消息、加载历史 |
| `conversationList` | 左侧历史会话列表、active/archived 切换、新建/归档 |
| `learningFlow` | 当前 `learningState`、会话锁定、当前练习 attempt、合法 action |
| `stream` | 内部流式连接、流事件消费、Widget 增量更新 |
| `widgetRegistry` | Widget schema、action 校验、状态恢复 |
| `userProfile` | 用户画像缓存（name、level、preferences） |
| `inputMode` | 当前输入模式（chat/fill/select） |
| `followUp` | 当前辅助追问线程、源消息上下文、右侧追问消息 |

### 3.4 API 客户端

```ts
const api = {
  // Auth
  login: (email, pw) => ...,
  register: (email, pw, name) => ...,

  // Chat
  sendMessage: (convId, text) => Promise<{ messageId: string }>,
  sendAction: (convId, action: QuickAction) => Promise<{ messageId: string }>,
  submitAnswer: (convId, exerciseAttemptId, answer) => Promise<{ messageId: string }>,
  openFollowUp: (convId, sourceMessageId, sourceRef) => Promise<{ branchThreadId: string }>,
  sendFollowUpMessage: (branchThreadId, text) => Promise<{ messageId: string }>,
  getStream: (convId, messageId) => EventSource,
  getHistory: (convId, before?, limit?) => ...,
  getExerciseAttempts: (convId) => ...,
  getGradingResults: (convId) => ...,

  // Conversation
  listConversations: () => ...,
  createConversation: () => ...,
};
```

`sendAction` 用于快捷按钮点击——与 `sendMessage` 类似，但携带的是结构化 action 而非文本。系统先校验 action 和 `learningState`：确定性动作直接由系统服务执行，内容生成类动作再进入 AI 调度。

## 4. 后端架构

### 4.1 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 注册 |
| `/api/auth/login` | POST | 登录 |
| `/api/auth/me` | GET | 当前用户 |
| `/api/conversations` | GET | 会话列表 |
| `/api/conversations` | POST | 新建会话 |
| `/api/conversations/:id/messages` | GET | 历史消息（分页） |
| `/api/branch-threads` | POST | 从源消息打开辅助追问 |
| `/api/branch-threads/:id/messages` | GET/POST | 辅助追问消息列表 / 发送辅助追问 |
| `/api/chat/send` | POST | 发送消息/action，返回 messageId |
| `/api/chat/submit-answer` | POST | 提交正式答案，创建 attempt 并触发批改 |
| `/api/chat/stream` | GET | 内部流式接收 Skill 输出 |
| `/api/exercise-attempts` | GET | 查询练习索引，供复盘/重练使用 |
| `/api/grading-results` | GET | 查询批改索引，供复盘/重练使用 |
| `/api/health` | GET | 健康检查 |

### 4.2 核心服务

```ts
// server/services/chat-service.ts
async function handleUserInput(conversationId: string, userId: string, input: UserInput) {
  // 1. 读取并校验主学习流状态
  const flow = await learningFlowService.getState(conversationId);
  await systemActionService.assertAllowed(flow, input);

  // 2. 创建用户消息
  const userMsg = await createMessage(conversationId, {
    type: input.type === 'text' ? 'user-message' : 'user-answer',
    role: 'user',
    content: input.content,
  });

  // 3. 系统确定性动作先执行，不进入 AI 调度
  const systemResult = await systemActionService.tryHandle(conversationId, userId, input);
  if (systemResult.handled) return systemResult.response;

  // 4. 创建 AI 消息占位
  const aiMsg = await createMessage(conversationId, {
    type: 'ai-text', // 初始类型，流式过程中可能升级为 ai-widget
    role: 'ai',
    content: {},
  });

  // 5. AI 调度：给出 Skill 建议。学习菜单点击会以结构化 action 进入同一调度流程。
  const route = await aiRouter.route(userId, conversationId, input.text, input.action);

  // 6. 获取并校验 Skill
  const skill = skillRegistry.get(route.skillName) || skillRegistry.get('general-chat');
  await learningFlowService.assertSkillAllowed(flow.learningState, skill);

  // 7. 异步执行 Skill，流式写入
  startSkillStream(aiMsg.messageId, skill, {
    userId,
    conversationId,
    learningState: flow.learningState,
    userProfile: await getUserProfile(userId),
    recentMessages: await getRecentMessages(conversationId, 10),
    params: route.params,
  });

  return { messageId: aiMsg.messageId };
}
```

### 4.3 AI Router

```ts
// server/services/ai-router.ts
async function route(userId: string, conversationId: string, userText: string) {
  const prompt = buildRouterPrompt({
    skillDescriptions: skillRegistry.getDescriptionsForAI(),
    userProfileSummary: await getUserProfileSummary(userId),
    recentMessages: await getRecentMessages(conversationId, 10),
    activeSkill: await getActiveSkill(conversationId),
    learningState: await getLearningState(conversationId),
    userText,
  });

  const result = await aiService.generateJson<RouterResult>(prompt);

  if (result.confidence < 0.6) {
    // 返回低置信度，前端展示确认选项
    return { ...result, needsConfirmation: true };
  }

  return result;
}
```

### 4.4 目录结构

```text
echora/
├── doc/
│   ├── requirements/            (原 V1 需求，保留)
│   └── requirements_v1/         (MVP 需求)
├── migrations/
├── server/
│   ├── app.ts
│   ├── start.ts
│   ├── config/
│   ├── db/
│   ├── middleware/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── chat.ts
│   │   ├── conversations.ts
│   │   └── health.ts
│   ├── services/
│   │   ├── ai/
│   │   │   ├── provider.ts        (AI Provider 抽象)
│   │   │   ├── ai-router.ts       (意图识别 + Skill 匹配)
│   │   │   └── prompt-builder.ts  (路由 Prompt 构造)
│   │   ├── chat-service.ts        (消息处理、Skill 调度)
│   │   ├── learning-flow-service.ts (状态机、会话锁定)
│   │   ├── system-action-service.ts (确定性动作)
│   │   ├── widget-registry.ts     (Widget schema/action 校验)
│   │   └── user-profile-service.ts
│   ├── skills/                    (Skill 实现目录)
│   │   ├── registry.ts            (Skill 注册表)
│   │   ├── onboarding.ts
│   │   ├── scene-select.ts
│   │   ├── practice.ts
│   │   ├── grade.ts
│   │   ├── explain.ts
│   │   ├── review.ts
│   │   ├── retry.ts
│   │   └── general-chat.ts
│   └── types/
├── shared/
│   ├── skill-types.ts
│   └── message-types.ts
├── src/
│   ├── api/client.ts
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatView.vue
│   │   │   ├── MessageList.vue
│   │   │   ├── ChatInput.vue
│   │   │   ├── LearningMenuPanel.vue
│   │   │   ├── WidgetRenderer.vue
│   │   │   ├── messages/
│   │   │   │   ├── SystemMessage.vue
│   │   │   │   ├── AiTextMessage.vue
│   │   │   │   ├── AiWidgetMessage.vue
│   │   │   │   ├── UserMessage.vue
│   │   │   │   └── DividerMessage.vue
│   │   │   └── widgets/
│   │   │       ├── SceneCardsWidget.vue
│   │   │       ├── ExerciseCardWidget.vue
│   │   │       ├── FillBlankWidget.vue
│   │   │       ├── ChoiceQuestionWidget.vue
│   │   │       ├── GradingResultWidget.vue
│   │   │       ├── ProgressSummaryWidget.vue
│   │   │       └── ConversationLockWidget.vue
│   │   └── auth/
│   ├── composables/
│   │   ├── useChatStream.ts
│   │   └── useAutoScroll.ts
│   ├── stores/
│   │   ├── auth.ts
│   │   ├── conversation.ts
│   │   ├── learningFlow.ts
│   │   ├── widgetRegistry.ts
│   │   ├── stream.ts
│   │   ├── userProfile.ts
│   │   └── inputMode.ts
│   ├── router/
│   └── types/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
└── vite.config.ts
```

## 5. 流式通信时序

```text
浏览器                              服务端                         AI Provider
  │                                   │                               │
  │ POST /api/chat/send               │                               │
  │ { conversationId, text }          │                               │
  │ ─────────────────────────────────>│                               │
  │                                   │ 系统校验状态与确定性动作         │
  │                                   │ AI 调度建议 Skill               │
  │                                   │                               │
  │ { messageId: "msg_042" }          │                               │
  │ <─────────────────────────────────│                               │
  │                                   │                               │
  │ GET /api/chat/stream              │                               │
  │   ?conversationId=...&msgId=...   │                               │
  │ ─────────────────────────────────>│                               │
  │                                   │ skill.handler(ctx)            │
  │                                   │ ─────────────────────────────>│
  │                                   │                               │
│ <── stream: message-start ───────│                               │
  │                                   │ <── stream chunk 1 ───────────│
│ <── stream: chunk (text-chunk) ──│                               │
  │                                   │ <── stream chunk 2 ───────────│
│ <── stream: chunk (widget-init) ─│                               │
  │                                   │ ...                           │
│ <── stream: chunk (widget-ready) │                               │
│ <── stream: chunk (mode-switch) │                               │
│ <── stream: chunk (done) ───────│                               │
│ <── stream: message-end ────────│                               │
```

## 6. 非功能需求

| 指标 | 目标 |
|------|------|
| 首屏加载 | < 2s |
| 内部流首字节 | < 1s |
| AI 批改首字 | < 3s |
| 内部流断线重连 | EventSource 自动重连；前端文案显示"正在恢复连接" |
| 消息丢失率 | 0%（所有消息持久化） |
| Skill 注册 | 不影响现有 Skill，纯增量 |
