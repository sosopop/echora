# PRD 剩余缺口清单

> 日期: 2026-05-18
> 基线: 任务 048 完成后的代码与文档状态

## 说明

这份清单只记录截至当前仍未完全收口的项。它们大多属于工程加固、协议现代化或体验增强，不代表四阶段主学习主线没有完成。

## 剩余缺口

1. **Widget 样式目录拆分**（工程收尾项）
   - 现状: widget 相关样式还集中在现有公共样式与少量模块里。
   - 缺口: 是否拆出 `src/styles/widgets/` 子目录仍未最终定案。
   - 价值: 提高 widget 体系后续扩展时的样式可维护性。

## 已关闭缺口

1. **SSE 传输现代化与多副本恢复**（PRD §2.8 / §3.4 / §5.1）
   - 完成: 前端已切到 `fetch + ReadableStream`,SSE 认证使用 `Authorization` 头,重连使用 `Last-Event-ID`。
   - 完成: 053 起后端明确以 `messages.stream_events` 作为跨实例权威事件源,`streamBus` 只保留为本进程低延迟快路径;SSE 会先校验 stream 所有权,再按 streamId + seq 回放和轮询补回。
   - 说明: 本轮按产品决策不引入 Redis;高并发多副本可在 V2 评估 Redis Streams 或独立 append-only stream 表。

## 结论

截至当前,PRD 的核心主干已经完成,剩余项只剩少量工程收尾。后续推进优先从 **Widget 样式目录拆分** 继续。
