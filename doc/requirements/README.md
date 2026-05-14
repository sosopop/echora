# Echora 多文件需求文档

> 来源：由根目录 `echora_requirements.md` 拆分与补充生成  
> 版本：V1 需求基线  
> 更新日期：2026-05-14

Echora 是一个面向中文用户的 AI 英语情景练习网站。V1 聚焦汉译英能力训练，通过 AI 生成英汉双语情景对话，并把内容结构化为三阶段练习、即时批改、难度调节、错题复盘和长期学习画像。

## 文档索引

| 序号 | 文档 | 内容 |
|---|---|---|
| 00 | [产品范围](00-product-scope.md) | 产品定位、目标用户、产品目标、V1 功能边界 |
| 01 | [用户初始化与难度体系](01-user-onboarding-and-difficulty.md) | 首次进入流程、场景类别、CEFR 难度、初始短测 |
| 02 | [场景生成与结构化内容](02-scene-generation.md) | 场景主题生成、最近主题队列、场景 JSON、练习题 JSON |
| 03 | [练习、批改与对话窗口](03-practice-and-grading.md) | 三阶段汉译英、练习流程、AI 批改、主聊天与辅助解析窗口、难度调整 |
| 04 | [复盘、薄弱点与数据模型](04-review-data-and-models.md) | 薄弱点分析、复盘重练、核心数据模型 |
| 05 | [API 与 AI Prompt](05-api-and-ai-prompts.md) | V1 API 契约、AI 生成与批改 Prompt 要求 |
| 06 | [技术栈与系统架构](06-technical-stack-and-architecture.md) | 参考 `D:\code\gotta_english` 的技术选型、目录结构、服务架构、质量策略 |
| 07 | [UI 设计系统](07-ui-design-system.md) | 参考 getdesign Claude 风格的 Echora UI 规范、色彩、排版、组件与页面布局 |
| 08 | [验收、迭代与风险](08-acceptance-roadmap-and-risks.md) | V1 验收标准、迭代规划、主要风险与解决方案 |

## V1 核心闭环

```text
用户初始化
  ↓
生成 100 个候选场景主题
  ↓
随机选择 1 个主题
  ↓
生成结构化英汉双语对话
  ↓
生成三阶段汉译英练习
  ↓
用户作答并获得即时批改
  ↓
保存答题、错题和薄弱点
  ↓
更新 difficultyScore
  ↓
复盘重练
  ↓
根据历史表现生成下一轮内容
```

## 技术基线摘要

V1 推荐沿用 `gotta_english` 已验证的轻量全栈路线：

| 层级 | 推荐选型 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Vue Router + Pinia |
| UI | 自研组件 + lucide-vue-next 图标 + ECharts 数据可视化 |
| 后端 | Node.js + Express 5 + TypeScript ESM |
| 数据库 | SQLite + better-sqlite3 + SQL migrations |
| 校验 | Zod + JSON Schema |
| 鉴权 | JWT + bcryptjs |
| AI | AI Provider 抽象层，V1 可接 Google Gemini 或兼容 provider |
| 测试 | Vitest + Vue Test Utils + Jest + Supertest + Smoke tests |
| 构建 | `tsc` 编译后端，Vite 构建前端，Express 托管 `dist-web` |

## UI 基线摘要

Echora 的 UI 不做营销式落地页，第一屏应直接进入可练习、可复盘的产品界面。整体采用暖调、克制、编辑感的 AI 学习工具气质：暖陶土色作为主强调色，纸张感背景承载内容，边框和轻量 ring shadow 表示层级，卡片圆角控制在 8px 以内。

参考来源：[getdesign.md Claude Design System Analysis](https://getdesign.md/claude/design-md)
