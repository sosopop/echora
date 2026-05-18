> 日期: 2026-05-18
> 序号: 054
> 任务: Widget 样式目录拆分与缺口归零

## 任务背景

根据 `doc/prd-gap-audit.md` 的最后一个工程收尾项,本次将运行时代码中的通用 widget 壳样式拆入 `src/styles/widgets/`,并关闭 PRD 剩余缺口清单。

## 执行摘要

- `src/styles/widgets/base.css` — 新增 widget 全局壳样式目录,承载 `.widget` / `.widget-head` / `.widget-body` / `.widget-foot`。
- `src/styles/components.css` — 移除 widget 通用容器样式,保留按钮、消息、状态条等通用样式。
- `src/main.tsx` — 注入 `src/styles/widgets/base.css`,维持运行时样式加载顺序。
- `doc/knowledge/styling.md` — 更新样式入口和 widget 样式边界,记录 `src/styles/widgets/` 已落地。
- `doc/prd-gap-audit.md` — 将 Widget 样式目录拆分移动到已关闭缺口,剩余缺口清零。

## 手工测试

### Widget 前端测试

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/WidgetSlot.test.tsx
```

实测输出:

```text
Test Files  2 passed (2)
Tests  38 passed (38)
```

结论:widget 渲染、loading 防线与 WidgetSlot 过滤逻辑均未受样式拆分影响。

### 完整单元测试

命令:

```bash
npm run test:unit
```

实测输出:

```text
Test Suites: 16 passed, 16 total
Tests:       141 passed, 141 total
Test Files   12 passed (12)
Tests        92 passed (92)
```

结论:后端 Jest 与前端 Vitest 单元测试全部通过。观察到既有 React Router future flag warning 和 profile store 负样本日志,不影响测试结果。

### 构建

命令:

```bash
npm run build
```

实测输出:

```text
✓ 81 modules transformed.
✓ built in 2.43s
(!) Some chunks are larger than 500 kB after minification.
```

结论:生产构建通过。chunk size 为既有 Vite 提示,本次未处理代码分包。

### 学习闭环 smoke

命令:

```bash
npm run test:smoke:learning
```

实测输出:

```text
[smoke:learn] PASSED 13 / 13
```

结论:四阶段练习、复盘、重练、解释、低置信确认、归档负样本等学习主线 smoke 全部通过。

### 全量测试

命令:

```bash
npm test
```

实测输出:

```text
[smoke] PASSED 6/6
[smoke:onb] PASSED 11 / 11
[smoke:learn] PASSED 13 / 13
Test Suites: 16 passed, 16 total
Tests:       141 passed, 141 total
Test Files  12 passed (12)
Tests       92 passed (92)
```

结论:完整门禁通过。观察到既有 React Router future flag warning 和 profile store 负样本日志,不影响测试结果。

### Diff 空白检查

命令:

```bash
git diff --check
```

实测输出:

```text
warning: in the working copy of 'doc/knowledge/styling.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'doc/prd-gap-audit.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/main.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/styles/components.css', LF will be replaced by CRLF the next time Git touches it
```

结论:无 trailing whitespace 或 patch 格式错误;仅 Git 行尾提示。

### 负样本

- `WidgetSlot` 缺字段题卡不渲染空槽位的测试继续通过。
- 学习 smoke 中 archived 会话继续练习返回 400 且不创建消息的负样本继续通过。

### 总结

已跑过 6 / 6 步,全部通过;其中包含 2 类负样本覆盖。

## 遗留 TODO

- [前端] Vite build 仍提示主 chunk 超过 500 kB,属于后续性能优化项,非本次 PRD 缺口。
- [文档] 若后续发现新 PRD 缺口,继续追加到 `doc/prd-gap-audit.md`。

## 下一阶段建议

1. **PRD 完成态回归**(PRD §5.1 / §5.2)— 在最终交付前可跑一次 `npm test` 全量门禁,覆盖 stub smoke、onboarding smoke 与 learning smoke。
2. **构建体积优化**(PRD §3.4)— 针对 Vite 500 kB chunk warning 评估动态 import 或 manualChunks,降低首屏加载风险。
3. **真实 Provider 抽样验收**(PRD §3.3 / §5.2)— 在具备 API key 的环境运行 `npm run test:smoke:ai`,验证真实 provider 显式失败与核心链路质量。
