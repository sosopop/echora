> 日期: 2026-05-19
> 序号: 062
> 任务: 新增 LangGraph 核心引擎重构设计文档

## 任务背景

用户希望在 `doc/` 下新增一个用于存放设计重构设想的目录,并基于 LangGraph 方案重新撰写一份详细的 Echora 核心引擎重构设计文档。该任务只涉及文档新增,不改变当前代码行为。

## 执行摘要

- `doc/refactor/README.md` — 新增重构设想目录说明,明确该目录文档是方案讨论材料,不作为当前实现事实源。
- `doc/refactor/langgraph-core-engine-redesign.md` — 新增 LangGraph 核心引擎重构设计,覆盖背景、目标、总体架构、GraphState、图拓扑、Widget 事件协议、长期记忆、AI 生成工作流边界、渐进迁移方案、风险控制和推荐技术落点。
- `doc/task/062-langgraph-core-engine-redesign.md` — 新增本次执行记录。

## 手工测试

### 文档文件检查

命令:

```powershell
Get-ChildItem doc\refactor -File | Select-Object Name,Length
```

输出:

```text
Name                             Length
----                             ------
langgraph-core-engine-redesign.md  15516
README.md                            441
```

结论:新增 `doc/refactor/` 目录下包含目录说明和 LangGraph 重构设计文档。

### 章节结构检查

命令:

```powershell
Select-String -Path doc\refactor\langgraph-core-engine-redesign.md -Pattern '^#|^## '
```

输出节选:

```text
doc\refactor\langgraph-core-engine-redesign.md:1:# Echora LangGraph 核心引擎重构设计
doc\refactor\langgraph-core-engine-redesign.md:7:## 1. 背景
doc\refactor\langgraph-core-engine-redesign.md:24:## 2. 目标与非目标
doc\refactor\langgraph-core-engine-redesign.md:42:## 3. 推荐总体架构
doc\refactor\langgraph-core-engine-redesign.md:70:## 4. 核心概念映射
doc\refactor\langgraph-core-engine-redesign.md:84:## 5. GraphState 设计
doc\refactor\langgraph-core-engine-redesign.md:152:## 6. 图拓扑设计
doc\refactor\langgraph-core-engine-redesign.md:251:## 7. Widget 与事件协议
doc\refactor\langgraph-core-engine-redesign.md:288:## 8. 持久化与长期记忆
doc\refactor\langgraph-core-engine-redesign.md:328:## 9. AI 生成工作流的边界
doc\refactor\langgraph-core-engine-redesign.md:373:## 10. 渐进迁移方案
doc\refactor\langgraph-core-engine-redesign.md:443:## 11. 风险与控制
doc\refactor\langgraph-core-engine-redesign.md:453:## 12. 推荐技术落点
doc\refactor\langgraph-core-engine-redesign.md:491:## 13. 决策建议
```

结论:设计文档具备完整章节结构,覆盖重构方案的主要决策面。

### 负样本检查

命令:

```powershell
Test-Path doc\refactor\missing-langgraph-plan.md
```

输出:

```text
False
```

结论:负样本路径不存在,未误生成额外同类文档。

### 总结

已跑过 3 / 3 步,全部通过。本次无后端 API、前端 UI 或 SSE 行为变更,因此未运行 curl、浏览器或自动化测试。

## 遗留 TODO

- [文档] 若后续决定实施 LangGraph 重构,需要把该设计拆解为 milestone 文档和可执行任务切片。
- [后端] 当前文档未引入 `@langchain/langgraph` 依赖,实际迁移前需要做技术 spike。
- [测试] 当前仅做文档存在性与章节结构检查,未验证 LangGraph 原型代码。

## 下一阶段建议

1. **主学习流图化 spike**(PRD §2.3, §2.4)— 先把 `onboarding -> scene_selecting` 包装成 LangGraph 子图,验证状态转移和现有 `SkillEvent` 能否无缝适配。
2. **长期学习记忆抽象**(PRD §2.7, §3.3)— 在不破坏现有英语数据表的前提下,设计跨学科 `subject` / `skill_key` / `mastery dimension` 抽象。
3. **Widget 协议扩展评审**(PRD §4.7)— 盘点英语之外的数学、语文 Widget 需求,确认现有 envelope 是否足够承载新题型。
4. **辅助追问线程重构验证**(PRD §3.2)— 用 branch subgraph 验证支线追问不改变主学习流,并继续遵守锁定态防泄露规则。

