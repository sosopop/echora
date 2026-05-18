> 日期: 2026-05-18
> 序号: 043
> 任务: 场景完成后自动调节难度

## 任务背景

PRD §2.6 除了支持“太难/太简单”的手动难度反馈,还要求系统能根据连续场景表现自动升降难度。本次补齐的是“场景完成后”的规则侧闭环,让阶段 4 结束后的下一轮推荐更贴合用户真实表现。

## 执行摘要

- `server/services/difficultyAdaptation.ts` — 新增自动难度调节服务,从最近已完成场景中归纳 `firstPass` / `earlyStruggle` 表现,并在满足连续 2 场景条件时调用 `adjustProfileLevel`。
- `server/skills/grade.ts` — 在阶段 4 完成并准备进入 `awaiting_next` 前触发自动难度评估,若发生升/降级则追加自然语言说明。
- `server/__tests__/learning-services.test.ts` — 覆盖连续两个顺利场景提难、连续两个吃力场景降难、混合表现不调整、主线题量不完整不计入完整场景等情况。
- `doc/knowledge/skills.md`、`doc/knowledge/state-machine.md`、`doc/knowledge/api-contract.md` — 同步记录自动难度发生在阶段 4 完成到 `awaiting_next` 之间,且不会引入新的 ChatAction / widget schema。

## 手工测试

### 后端聚焦单测

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/learning-services.test.ts server/__tests__/skill-grade.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/skill-grade.test.ts
PASS server/__tests__/learning-services.test.ts
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

### 全量单测

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       121 passed, 121 total
Test Files  10 passed (10)
Tests       83 passed (83)
```

### Smoke

命令:

```bash
npm run test:smoke:learning
```

观察输出:

```text
[smoke:learn] PASSED 13 / 13
```

### 构建

命令:

```bash
npm run build
```

观察输出:

```text
✓ built in 2.22s
(!) Some chunks are larger than 500 kB after minification.
```

### 负向场景

- 新增单测 `主线阶段题量不完整时不计入已完成场景` 通过,说明只有阶段 4 单题正确或主线题量残缺时,不会误触发自动升降级。
- `git diff --check` 仅提示 LF/CRLF 转换警告,未出现 whitespace error。

## 遗留 TODO

- [后端] 自动调级目前仍只作用于“场景完成后”,还没有做按单题即时反馈的细粒度升降。
- [后端] 当前阶段 1-4 仍固定每阶段 2 题,尚未按表现动态伸缩到更细的 5-10 题分布。
- [前端] 难度变化只通过普通文本提示,还没有专门的可视化状态组件。
- [测试] 还缺一条端到端 smoke 去显式断言“连续 2 场顺利/吃力”会改变下一轮场景难度。

## 下一阶段建议

1. **辅助追问加入复盘**（PRD §3.2）— 让用户在支线确认的错因/解释能回写到复盘统计,补齐“问完回主线”之外的数据闭环。
2. **动态题量**（PRD §2.6）— 将主线 4 阶段的题量从固定每阶段 2 题扩展为随等级和表现变化的 5-10 题分配。
3. **移动端辅助追问抽屉完善**（PRD §4.1）— 补齐遮罩、Esc 关闭、焦点恢复等细节,让支线在手机上更稳。
4. **自动难度 UI 提示**（PRD §2.6 / §4.x）— 为升降级结果增加更明确的视觉反馈,减少用户只靠文本理解变化的负担。
