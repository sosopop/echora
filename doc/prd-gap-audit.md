# PRD 剩余缺口清单

> 日期: 2026-05-18
> 基线: 任务 048 完成后的代码与文档状态

## 说明

这份清单只记录截至当前仍未完全收口的项。它们大多属于工程加固、协议现代化或体验增强，不代表四阶段主学习主线没有完成。

## 剩余缺口

暂无。

## 已关闭缺口

1. **SSE 传输现代化与多副本恢复**（PRD §2.8 / §3.4 / §5.1）
   - 完成: 前端已切到 `fetch + ReadableStream`,SSE 认证使用 `Authorization` 头,重连使用 `Last-Event-ID`。
   - 完成: 053 起后端明确以 `messages.stream_events` 作为跨实例权威事件源,`streamBus` 只保留为本进程低延迟快路径;SSE 会先校验 stream 所有权,再按 streamId + seq 回放和轮询补回。
   - 说明: 本轮按产品决策不引入 Redis;高并发多副本可在 V2 评估 Redis Streams 或独立 append-only stream 表。

2. **Widget 样式目录拆分**（工程收尾项）
   - 完成: 054 起新增 `src/styles/widgets/base.css`,承载运行时代码中的通用 `.widget` / `.widget-head` / `.widget-body` / `.widget-foot` 壳样式。
   - 完成: `src/components/widgets/widgets.module.css` 继续承载具体 widget 组件细节,避免全局污染。

## 结论

截至当前,PRD V1 核心主干与本清单记录的剩余缺口均已关闭。后续如出现新需求或回归,请重新追加到本清单。
