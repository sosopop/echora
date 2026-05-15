# Echora V1 MVP 需求文档

> 版本：V1 MVP
> 更新日期：2026-05-15
> 设计理念：AI 会话流式学习 + 对话即界面 + 小部件工作台

## 一句话描述

一个聊天工作台承载所有英语学习功能。左侧是历史对话，中间是连续自然的主学习流，右侧可针对任意消息打开辅助追问。用户只通过底部交互区和对话内容列表完成学习、练习、批改、复盘和历史回顾。

## 核心设计原则

| 原则 | 说明 |
|------|------|
| **AI 会话流式学习** | AI 回复、练习题、批改和复盘都在同一条学习流中实时展开，过程连续、自然、可回看。 |
| **能力单元架构** | 内部所有功能抽象为可插拔 Skill，AI 根据上下文自动选择能力；用户不需要知道 Skill、路由或命令。 |
| **小部件即功能** | 对话流中可嵌入交互小部件（场景选择器、填空题编辑器、批改卡片、复盘摘要、登录注册/账号保存等），由 AI 在合适时机展示。 |
| **辅助追问** | 用户可从某条消息、某个答案、某个语法点或小部件打开右侧支线，持续追问但不打断主练习流。 |
| **自适应交互区** | 底部交互区根据当前状态自动切换为自由输入、填空、选择或学习菜单。 |
| **结构化学习记录** | 所有实时生成过程、消息、小部件状态和历史复盘都被持久化，可完整恢复。 |
| **Profile-Driven** | 首次使用时收集用户基础画像（年龄、性别、年级、英语水平），AI 据此个性化生成场景和学习路径。 |

## 文档索引

| 序号 | 文档 | 内容 |
|------|------|------|
| 00 | [产品范围](00-v1-product-scope.md) | 产品定位、Skills 架构原则、V1 MVP 功能边界 |
| 01 | [聊天界面、Skill 体系与 AI 路由](01-chat-interface-and-ai-routing.md) | 内部能力调度、输入区模式、对话列表、消息类型、小部件、辅助追问 |
| 02 | [用户画像与个性化场景](02-user-profile-and-scene-selection.md) | 初始信息收集、画像驱动场景推荐、场景选择小部件、自定义场景 |
| 03 | [练习与学习闭环](03-practice-and-learning-loop.md) | 练习 Skill、批改反馈、填空/选择模式、难度自适应、复盘 Skill |
| 04 | [数据模型与流式记录](04-data-model-and-streaming.md) | 用户画像、Skill 注册表、结构化消息流、Widget 状态 |
| 05 | [技术架构](05-technical-architecture.md) | Skills 插件架构、内部流式传输、Skill Registry、前后端设计 |
| 06 | [极简 UI 设计](06-ui-design-minimal.md) | 聊天工作台布局、输入模式切换、Widget 渲染、消息气泡、辅助追问 |
| 07 | [验收与迭代](07-acceptance-and-roadmap.md) | MVP 验收标准、Skill 扩展路线 |
| 08 | [AI 工作流与 Widget 契约](08-ai-workflow-and-widget-contract.md) | 学习流状态机、AI/系统边界、Widget 协议、会话锁定、结构化学习记录 |
| 09 | [原型与主题设计附录](09-prototype-and-theme-appendix.md) | V1 Plus 原型页面、明暗主题、色彩搭配、样式基准、验收口径 |
| 10 | [产品工作流发散式迭代记录](10-product-workflow-iteration-log.md) | 需求树、发散想法、MVP 取舍、候选分支与砍掉项记录 |

## 架构速览

```text
用户自然输入 / 点击学习菜单
  ↓
系统校验当前 learningState 与 action
  ↓
AI 内部调度给出 Skill / Widget 建议
  ↓
系统执行确定性动作（登录、保存、提交答案、锁定会话等）
  ↓
Skill.execute(context) 实时返回文本 + 合法 Widget
  ↓
系统写入 messages + 结构化学习索引
  ↓
前端渲染主学习流 + Widget + 输入模式
  ↓
用户可从消息打开右侧辅助追问继续深入
```

V1 的实现基准以 `08-ai-workflow-and-widget-contract.md` 为准。其他文档描述功能时应遵守同一套状态机、Widget 生命周期、会话锁定和辅助追问边界。原型页面和主题样式以 `09-prototype-and-theme-appendix.md` 为准，并严格参照 `DESIGN.md`。需求发散、取舍和持续审计记录在 `10-product-workflow-iteration-log.md` 中；只有被标记为 MVP 且同步回 `08` 契约的内容才进入当前实现基准。

## 与旧 V1 的关系

本 V1 MVP 需求是对原 `doc/requirements/` 的架构级重构。核心学习闭环保留（场景→练习→批改→复盘），但表现形式从"多页面结构化工具"转变为"Skills 驱动的 AI 对话应用"。

MVP 实现以 `doc/requirements_v1/` 为准，原需求文档作为后续迭代参考保留在 `doc/requirements/`。
