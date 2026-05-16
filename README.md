# Echora

英语场景对话练习 AI Agent · V1 MVP 基础框架

## 启动

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run migrate             # 建表(SQLite,首次必跑)
npm run dev                 # 启动后端 8787
npm run dev:web             # 另开窗口启动前端 5173
```

浏览器访问 http://localhost:5173

## 命令一览

| 命令 | 用途 |
|---|---|
| `npm run dev` | 后端 tsx watch · NODE_ENV=development |
| `npm run dev:web` | 前端 Vite · 5173,代理 `/api` 到 8787 |
| `npm run build` | 编译后端到 `dist-server/`,构建前端到 `dist-web/` |
| `npm run migrate` | 顺序执行 `migrations/*.sql` |
| `npm test` | 后端 + 前端 + 烟雾全跑(=test:server + test:web + test:smoke) |
| `npm run test:unit` | 后端 + 前端单元(跳过烟雾) |
| `npm run test:server` | Jest + supertest,后端路由/服务 |
| `npm run test:web` | Vitest + jsdom,前端 store/视图 |
| `npm run test:smoke` | 端到端冒烟:启服务跑核心流程 |
| `npm run release` | 生成 `release/` 干净发布目录 |

## 目录

```
server/        后端入口、路由、服务、数据库、Skills、AI Provider
src/           前端入口、路由、stores、views、components、API client、styles
shared/        前后端共享类型(Skill / Widget / API DTO / 错误码)
migrations/    SQL 迁移
tests/smoke/   跨层端到端
doc/           工程规范、产品需求、设计原型、知识库、任务执行记录
```

## 文档导航

- `doc/prd.md` 产品需求
- `doc/esd.md` 工程规范
- `DESIGN.md` 视觉系统
- `doc/design/` 设计原型(可双击 `index.html` 浏览)
- `doc/knowledge/README.md` 工程知识库索引(协作者必读)
- `doc/task/` 任务执行记录(每次任务必产,序号 001 起递增)

## 已知陷阱

- **NodeNext 强制 `.js` 后缀**:`server/` 内相对导入即使源是 `.ts` 也必须写 `'./db/connect.js'`
- **better-sqlite3 编译**:Windows 首次 `npm install` 失败时,`npm config set msvs_version 2022` 然后重试
- **JWT 默认密钥**:`JWT_SECRET` 默认值仅供 dev,生产必须改
- **EventSource 不能附 Header**:V1 SSE token 走 `?token=` 查询参数,生产化前迁 fetch+stream
