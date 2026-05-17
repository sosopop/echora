> 日期: 2026-05-18
> 序号: 042
> 任务: 太难太简单难度反馈闭环

## 任务背景

PRD §2.6 要求系统支持自适应难度,用户直说“太难/太简单”时应立即影响下一题或下一场景。此前这类文本在 `practicing` 中可能被自由文本答案兜底包装成 `submit-answer`,体验和状态都不对。

## 执行摘要

- `server/services/profile.ts` — 新增 `adjustProfileLevel`,按 CEFR A1-C2 上下调用户画像等级,边界不越界。
- `server/routes/chat.ts` — 在自由文本答案兜底前识别难度反馈:
  - `太难` / `简单一点` / `too hard` / `easier` 下调等级。
  - `太简单` / `难一点` / `too easy` / `harder` 上调等级。
  - 调整后确定性路由到 `scene-select + request-new-scenes`,并携带 `difficultyFeedback`。
- `server/skills/sceneSelect.ts` — 接收 `difficultyFeedback`,输出自然说明,并在非 `scene_selecting` 状态统一切回 `scene_selecting` 后生成候选。
- `server/__tests__/chat-route.test.ts` — 覆盖 `practicing` 中“太难”不会被当作答案,且会下调 profile level。
- `server/__tests__/skill-sceneSelect.test.ts` — 覆盖难度反馈说明与状态切回。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md`、`doc/knowledge/state-machine.md` — 同步难度反馈协议和状态流。

## 手工测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/skill-sceneSelect.test.ts --runInBand
```

观察输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-sceneSelect.test.ts
Test Suites: 2 passed, 2 total
Tests:       36 passed, 36 total
```

命令:

```bash
npm run test:unit
```

观察输出:

```text
Test Suites: 16 passed, 16 total
Tests:       117 passed, 117 total
Test Files  10 passed (10)
Tests       83 passed (83)
```

命令:

```bash
npm run build
```

观察输出:

```text
vite v5.4.21 building for production...
✓ 80 modules transformed.
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.88s
```

命令:

```bash
git diff --check
```

观察输出:

```text
仅输出 LF will be replaced by CRLF 警告,无 whitespace error。
```

覆盖的正向场景:

- `practicing` 中输入“太难了,简单一点”会下调 `profile.level` B1 → A2,并路由到 `scene-select + request-new-scenes`。
- `scene_selecting` 中输入“太简单了,来点 harder 的”会上调 `profile.level` B1 → B2。
- `scene-select` 输出“从 B1 降低到 A2”说明,随后展示场景候选。

覆盖的负向场景:

- 难度反馈判断发生在答案兜底前,因此不会创建 `submit-answer` action,也不会把“太难/太简单”作为当前题答案批改。
- 等级调整使用 A1/C2 边界钳制,到边界时 `changed=false`,不越界。

## 遗留 TODO

- [后端] 连续 2 个场景全阶段一次通过自动提难、连续 2 个场景低表现自动降难仍未实现。
- [后端] 当前难度反馈直接影响下一批场景;“不换场景只调整下一题模板难度”还未做。
- [测试] smoke learning 尚未覆盖真实“太难/太简单”跨层场景。

## 下一阶段建议

1. **自动难度升降**(PRD §2.6) — 基于连续场景表现自动调整等级,补齐自适应难度的规则侧闭环。
2. **辅助追问加入复盘**(PRD §3.2) — 用户显式确认后将支线解释摘要或错因标签写入结构化统计。
3. **动态题量**(PRD §2.6) — 按等级/表现分配每阶段题量,不再固定每阶段 2 题。
4. **移动端辅助追问抽屉完善**(PRD §4.1) — 对齐历史抽屉体验,补遮罩、Esc 关闭和焦点恢复。
