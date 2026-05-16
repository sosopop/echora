# Echora 工程知识库

> 本目录是面向开发与 AI 协作的工程知识库根索引。
> 协作者打开新会话先读 `task-handoff.md`,再按需查具体主题。

## ⚠ 协作者必读

- **[task-handoff.md](./task-handoff.md)** — AI 协作交接约定:每次任务结束必产 `doc/task/<NNN>-<slug>.md` 执行记录与下一阶段建议

## 主题索引

- **[architecture.md](./architecture.md)** — 启动链路、目录边界、createApp 装配
- **[api-contract.md](./api-contract.md)** — HTTP 路由清单、SSE 协议、错误响应格式
- **[skills.md](./skills.md)** — 8 Skill 名单、registry、AI Provider 与 Router 边界
- **[state-machine.md](./state-machine.md)** — 5 学习态合法转移与会话锁定规则
- **[styling.md](./styling.md)** — tokens 与 components 用法、明/暗双主题切换约定

## 写法约定

- 根索引只做入口与问题路由,不承载长正文
- 单篇文档只覆盖一个主题或一条链路
- 正文优先写修改入口、约束、依赖、失败点和测试入口
- 引用源码用文件名 + 函数名/类名,不依赖易漂移的行号
- 暂时没把握的结论放入 pending 区域,确认后迁正文
- 任何公共行为、配置优先级、API 契约、共享类型、测试入口、构建发布路径变更后,
  都要同步检查本知识库
