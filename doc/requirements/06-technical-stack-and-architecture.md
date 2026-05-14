# 06. 技术栈与系统架构

## 1. 技术选型原则

本项目 V1 推荐参考 `D:\code\gotta_english` 的已验证技术路线，优先选择轻量、可本地开发、可单机部署、易测试的全栈架构。Echora 的核心复杂度在 AI 内容生成、结构化校验、练习状态和学习数据闭环，不应在 V1 引入过重的基础设施。

## 2. 推荐技术栈

| 层级 | 技术选型 | 说明 |
|---|---|---|
| 前端框架 | Vue 3 + TypeScript | SPA 单页应用，适合练习、复盘、设置等多页面状态 |
| 构建工具 | Vite | 快速开发与构建，输出 `dist-web` |
| 路由 | Vue Router | 管理登录、Dashboard、练习、复盘、设置等页面 |
| 状态管理 | Pinia | 管理认证、练习运行时、场景数据、UI 偏好 |
| UI 图标 | lucide-vue-next | 用统一线性图标表达操作按钮 |
| 数据可视化 | ECharts | 复盘页趋势图、薄弱点排名、难度曲线 |
| 后端框架 | Node.js + Express 5 + TypeScript | RESTful API，便于复用 `gotta_english` 的服务分层经验 |
| 数据库 | SQLite + better-sqlite3 | V1 低运维成本，支持事务和 SQL migrations |
| Schema 校验 | Zod + JSON Schema | API 入参、AI 输出、结构化内容统一校验 |
| 鉴权 | JWT + bcryptjs | 邮箱注册登录、密码哈希、接口鉴权 |
| AI SDK | Provider 抽象层 | V1 可接 Google Gemini 或其他兼容 provider |
| 测试 | Vitest + Vue Test Utils + Jest + Supertest | 前后端单元测试与 API 测试 |
| Smoke Test | tsx 脚本 | 覆盖启动、登录、核心接口、生成流程的轻量冒烟 |
| 配置 | dotenv + server.config.json + ai-providers.json | 分离环境变量、服务配置和 AI provider 配置 |

## 3. 与 `gotta_english` 的对齐点

参考项目当前技术栈特征：

1. `package.json` 使用 `"type": "module"`，前后端均为 TypeScript。
2. 前端使用 Vue 3、Vite、Pinia、Vue Router、lucide-vue-next。
3. 后端使用 Express 5、cors、jsonwebtoken、bcryptjs、better-sqlite3。
4. AI 层已有 provider 抽象和加载配置的思路。
5. 数据库通过 `migrations/` 下的 SQL 文件演进。
6. 测试分为后端 Jest、前端 Vitest、Smoke test。
7. 构建脚本先执行 `tsc -p tsconfig.server.json`，再执行 `vite build`。
8. Express 后端可以托管前端静态产物，并对 SPA 路由做回退。

Echora 可沿用这些工程骨架，但业务模块需要围绕“场景、练习会话、答题记录、薄弱点、复盘、辅助聊天线程”重新建模。

## 4. 推荐目录结构

```text
echora/
├── doc/
│   └── requirements/
├── migrations/
├── public/
├── scripts/
├── server/
│   ├── app.ts
│   ├── start.ts
│   ├── config/
│   ├── db/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   │   ├── ai/
│   │   ├── scene-service.ts
│   │   ├── exercise-service.ts
│   │   ├── grading-service.ts
│   │   ├── review-service.ts
│   │   └── weakness-service.ts
│   ├── types/
│   └── __tests__/
├── shared/
│   ├── schemas/
│   ├── cefr.ts
│   ├── exercise-types.ts
│   └── error-tags.ts
├── src/
│   ├── api/
│   ├── components/
│   ├── composables/
│   ├── router/
│   ├── stores/
│   ├── types/
│   ├── utils/
│   └── views/
├── tests/
│   └── smoke/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
└── vite.config.ts
```

## 5. 前端架构

### 5.1 页面模块

| 页面 | 路由建议 | 说明 |
|---|---|---|
| 登录/注册页 | `/auth` | 用户账号入口 |
| 初始设置页 | `/onboarding` | 选择场景类别、生成模式和初始难度 |
| 初始测试页 | `/placement-test` | 完成短测并确认等级 |
| 首页 Dashboard | `/dashboard` | 展示学习进度、推荐练习 |
| 场景练习页 | `/practice/:sessionId?` | 核心练习界面 |
| 场景复盘页 | `/review/scenes/:sceneId` | 查看历史场景 |
| 错题本页 | `/wrong-book` | 错题列表和重练 |
| 薄弱点分析页 | `/weakness` | AI 总结薄弱点 |
| 用户设置页 | `/settings` | 调整目标、难度、偏好 |

### 5.2 Store 划分

| Store | 职责 |
|---|---|
| `auth` | token、当前用户、登录注册、登出 |
| `onboarding` | 场景类别、生成模式、自定义场景、自选等级、短测状态 |
| `practiceRuntime` | 当前场景、阶段、题目、答案草稿、批改状态 |
| `review` | 历史场景、复盘报告、错题筛选 |
| `weakness` | 错误标签统计、薄弱点趋势、推荐练习 |
| `uiPreferences` | 主题、面板宽度、辅助窗口开关 |

### 5.3 API 客户端

前端应建立统一 API client：

1. 自动附带 JWT。
2. 统一处理 401、网络错误、服务端业务错误。
3. 请求和响应类型来自 `shared/schemas` 或前端类型。
4. 对 AI 长耗时接口提供 loading、retry、cancel 交互状态。

## 6. 后端架构

### 6.1 路由分层

| 路由前缀 | 模块 |
|---|---|
| `/api/auth` | 注册、登录、当前用户 |
| `/api/users` | 用户设置、场景类别偏好、难度 |
| `/api/placement-test` | 初始短测生成与提交 |
| `/api/scenes` | 主题生成、场景生成、场景完成 |
| `/api/exercises` | 练习题、提交答案、批改 |
| `/api/practice` | 练习会话创建、恢复、状态更新 |
| `/api/review` | 复盘报告、历史场景 |
| `/api/wrong-book` | 错题本、原题重练、变体重练 |
| `/api/weakness` | 薄弱点统计 |
| `/api/chat` | 主聊天和辅助解析线程 |
| `/api/health` | 服务健康检查 |

### 6.2 服务分层

```text
Route
  ↓
Input Schema Validation
  ↓
Service
  ↓
Repository / DB
  ↓
AIService / Domain Logic
  ↓
Output Schema Validation
```

核心服务：

| 服务 | 职责 |
|---|---|
| `UserService` | 用户资料、场景类别偏好、难度信息 |
| `PlacementTestService` | 初始短测生成、评分、定级 |
| `SceneService` | 主题生成、随机选择、场景生成、最近队列 |
| `ExerciseService` | 三阶段练习题生成、题目恢复 |
| `GradingService` | 答案评分、错误标签、批改记录 |
| `PracticeSessionService` | 会话状态机、中断恢复、完成结算 |
| `WeaknessService` | 错误标签聚合、薄弱点画像 |
| `ReviewService` | 复盘报告、错题重练、变体题 |
| `ChatService` | 主聊天、辅助解析线程、上下文组装 |
| `AIService` | 所有 AI 调用统一出口 |

## 7. 数据库与迁移策略

### 7.1 V1 数据库

V1 使用 SQLite，数据库文件可放在 `db/echora.sqlite`。所有表结构通过 `migrations/*.sql` 管理，不在代码中隐式建表。

### 7.2 关键表

| 表 | 说明 |
|---|---|
| `users` | 账号、密码哈希、昵称、语言偏好 |
| `user_profiles` | 场景类别偏好、场景生成模式、当前等级、难度分 |
| `placement_tests` | 初始测试记录 |
| `scenes` | 场景元信息和完整 JSON 快照 |
| `recent_scene_queues` | 最近 10 个主题 |
| `practice_sessions` | 当前练习状态机 |
| `exercise_records` | 场景级练习结果 |
| `answer_records` | 单题答题与批改详情 |
| `wrong_answers` | 错题本 |
| `weakness_profiles` | 薄弱点聚合 |
| `chat_threads` | 辅助解析线程 |
| `chat_messages` | 追问消息 |
| `ai_call_logs` | 最小化 AI 调用日志 |

### 7.3 迁移到 PostgreSQL 的预留

SQLite 能满足 V1 和单机部署。后续如需要多人协作、队列、并发生成和更强分析，可迁移到 PostgreSQL。为了降低迁移成本：

1. 主键使用文本 ID 或兼容 UUID。
2. JSON 快照集中在明确字段中。
3. 不依赖 SQLite 特有复杂语法。
4. Repository 层隔离 SQL。

## 8. AI 架构

### 8.1 AI 调用边界

所有 AI 调用必须通过 `AIService`，路由和业务服务不得直接调用 provider SDK。

```text
Business Service
  ↓
AIService
  ↓
Prompt Builder
  ↓
Provider Adapter
  ↓
Schema Validator
  ↓
Retry / Repair
```

### 8.2 AI 输出类型

| 输出 | 校验要求 |
|---|---|
| 主题列表 | 必须 exactly 100 条，字段完整 |
| 场景对话 | 必须符合 Scene JSON schema |
| 练习题 | 必须引用合法 `lineId` |
| 批改结果 | 必须包含分数、标签、解析、推荐答案 |
| 复盘总结 | 必须基于已有数据，禁止编造 |

### 8.3 调用日志

AI 日志只记录：

1. provider 名称。
2. 任务类型。
3. 请求耗时。
4. 成功或失败。
5. schema 校验错误摘要。

不默认记录用户完整答案、完整 prompt 或敏感信息。

## 9. 非功能需求

### 9.1 性能要求

| 项目 | 要求 |
|---|---|
| 页面首次加载 | < 3 秒 |
| 普通接口响应 | < 500ms |
| AI 批改响应 | 建议 < 5 秒 |
| AI 场景生成 | 建议 < 15 秒 |
| 历史记录查询 | < 1 秒 |

### 9.2 稳定性要求

1. AI 输出必须做 schema 校验。
2. AI 输出不合法时自动重试。
3. 重试失败时返回友好错误。
4. 用户答题记录必须先保存，再进入下一题。
5. 练习过程中刷新页面，应能恢复进度。
6. 重要写操作使用事务。

### 9.3 数据安全

1. 用户数据隔离。
2. 答题记录不可串号。
3. AI Prompt 中不传递敏感隐私。
4. 支持用户删除历史数据。
5. 后期支持数据导出。
6. 密码只保存 bcrypt 哈希。
7. JWT Secret 必须来自环境变量或本地配置，不能提交到仓库。

### 9.4 可扩展性

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

## 10. 测试策略

### 10.1 前端测试

使用 Vitest + Vue Test Utils + jsdom：

1. 练习运行时 store。
2. 答案输入组件。
3. 阶段切换和进度展示。
4. 批改结果展示。
5. 复盘和错题筛选组件。

### 10.2 后端测试

使用 Jest + Supertest：

1. Auth 路由。
2. 场景生成路由的 schema 校验。
3. 练习会话状态机。
4. 答题保存和批改记录。
5. 难度调整规则。
6. 薄弱点聚合。

### 10.3 AI 相关测试

1. Prompt Builder 快照测试。
2. AI 输出 schema 单元测试。
3. Provider adapter mock 测试。
4. 重试和修复逻辑测试。

### 10.4 冒烟测试

使用 `tsx tests/smoke/run-smoke.ts` 覆盖：

1. 服务启动和健康检查。
2. 注册登录。
3. 完成 onboarding。
4. 生成场景。
5. 提交一个答案。
6. 完成场景并生成复盘。

## 11. 开发脚本建议

```json
{
  "scripts": {
    "dev": "node scripts/dev-server.js",
    "dev:web": "vite",
    "build": "tsc -p tsconfig.server.json && vite build",
    "test": "npm run test:server && npm run test:web && npm run test:smoke",
    "test:unit": "npm run test:server && npm run test:web",
    "test:server": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand",
    "test:web": "vitest run",
    "test:smoke": "tsx tests/smoke/run-smoke.ts",
    "migrate": "tsx server/db/migrate.ts"
  }
}
```

## 12. 部署建议

V1 可采用单进程部署：

1. Vite 构建前端到 `dist-web`。
2. TypeScript 编译后端到 `dist-server`。
3. Express 托管 API 和静态前端。
4. SQLite 文件放在持久化目录。
5. 使用反向代理处理 HTTPS、gzip 和缓存。
6. 日志输出到文件或宿主平台日志系统。
