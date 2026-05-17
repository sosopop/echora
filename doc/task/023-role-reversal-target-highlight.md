> 日期: 2026-05-17
> 序号: 023
> 任务: 角色互换目标句明确标注

## 任务背景

用户反馈阶段 4 角色互换题卡中视觉上更突出的是 `Your role: Customer`,而真正要求用户表达的中文句子只藏在长题干里。本次将目标中文句单独作为题卡重点信息展示。

## 执行摘要

- `server/skills/_helpers/practiceFsm.ts` — 阶段 4 `role_reversal` 出题时新增 `display.targetZh`,只在普通题干/提示中说明当前角色。
- `server/skills/practice.ts` — 将 `targetZh` 写入 `exercise-card` widget data。
- `src/components/widgets/ExerciseCard.tsx` / `src/components/widgets/widgets.module.css` — 新增"请表达「中文目标句」"目标块,让用户要写的话成为题卡最醒目的内容;中文上下文支持换行。
- `shared/widget.ts` — `exercise-card` schema 补齐当前实际字段,新增 `targetZh` 兼容字段。
- `server/__tests__/skill-practice.test.ts` / `src/__tests__/components/widgets/widgets.test.tsx` — 覆盖阶段 4 输出 `targetZh`,并确认不再突出显示 `Your role`。
- `doc/knowledge/api-contract.md` / `doc/knowledge/skills.md` / `doc/knowledge/styling.md` — 记录 `targetZh` 协议与题卡展示规则。

## 手工测试

### 后端出题

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-practice.test.ts
```

输出:

```text
PASS server/__tests__/skill-practice.test.ts
Tests: 9 passed, 9 total
```

覆盖:阶段 3 通过后进入阶段 4 时,`exercise-card` data 包含 `targetZh`,且不再用 `contextEn` 输出 `Your role` 作为醒目上下文。

### 前端题卡

命令:

```bash
npx vitest run src/__tests__/components/widgets/widgets.test.tsx src/__tests__/views/WidgetSlot.test.tsx
```

输出:

```text
✓ src/__tests__/components/widgets/widgets.test.tsx (30 tests)
✓ src/__tests__/views/WidgetSlot.test.tsx (3 tests)
Tests: 33 passed
```

覆盖:角色互换题卡展示"请表达"与目标句 `「欢迎光临。」`,并确认 `Your role: Server` 不再出现;loading / 缺字段题卡负例仍不渲染。

### 学习闭环 Smoke

命令:

```bash
npm run test:smoke:learning
```

输出:

```text
[smoke:learn] PASSED 12 / 12
```

覆盖:完整 4 阶段学习闭环、错题、重练、provider 错误和低置信确认均保持正常。

### 构建

命令:

```bash
npm run build
```

输出:

```text
✓ built in 1.78s
```

### 空白检查

命令:

```bash
git diff --check
```

输出:

```text
Exit code 0; only CRLF normalization warnings, no whitespace errors.
```

### 总结

已跑过 5 / 5 步,全部通过。负样本包含缺字段题卡不渲染、provider 错误路径和重复提交锁定等 smoke 场景。

## 遗留 TODO

- [前端] 目标句块当前只用于阶段 4;若后续发现阶段 3 的"目标意思"也不够明显,可复用 `targetZh` 或新增 `targetMeaningZh`。
- [产品] 角色互换仍是单题式表达,完整自由多轮角色互换尚未接入。
- [测试] 尚未做浏览器截图回归;当前通过组件 DOM 和 smoke 验证。

## 下一阶段建议

1. **阶段 3 目标意思视觉增强**(PRD §2.6)— 对话接龙也有目标中文意思,可复用目标块提升读题速度。
2. **自由对话角色互换**(PRD §2.6)— 在目标句明确后,继续推进多轮角色扮演,让阶段 4 更像真实对话。
3. **复盘非分数化**(PRD §2.2 / §4.7)— 批改卡已改三档,建议复盘也改为三档分布和薄弱点趋势。
4. **错题恢复引导**(PRD §2.6)— 对 needs_review 后继续提交的场景给出更友好的继续练习提示。
