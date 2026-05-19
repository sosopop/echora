> 日期: 2026-05-19
> 序号: 063
> 任务: 九宫格场景选择卡片与自定义场景入口

## 任务背景

用户要求将聊天场景选择流程从少量推荐卡改为九宫格展示:一次给出 8 个推荐场景卡片,第 9 张为用户自定义场景入口,并为每张推荐卡配置不同 Emoji,让场景选择更直观生动。

## 执行摘要

- `server/skills/sceneSelect.ts` — 将 `scene-select` 默认展示数量改为 8,补充确定性兜底场景模板,候选不足或重复时补满 8 张;同时为推荐卡分配去重 Emoji,并在 widget 数据中保留 `allowCustom: true`。
- `server/skills/_helpers/sceneSelectFsm.ts` — 增加场景 topic 归一化逻辑,在筛选时同时过滤已用 topic 与候选内重复 topic。
- `shared/widget.ts` — 将 `scene-cards.data.cards` 契约上限从 5 改为 8;自定义入口不进入后端 cards 数组,由前端根据 `allowCustom` 渲染。
- `src/components/widgets/SceneCards.tsx`、`src/components/widgets/widgets.module.css` — 改为 3x3 九宫格布局,渲染 8 张推荐卡 + 第 9 张“自定义场景”卡,并补充窄屏 2 列 / 1 列响应式样式与稳定卡片高度。
- `src/stores/chat.ts`、`src/views/Chat/ChatInput.tsx` — 增加本地输入模式切换与聚焦请求;点击自定义卡只切回 chat 输入并聚焦 textarea,不发送后端 action、不创建消息。
- `server/__tests__/skill-sceneSelect.test.ts`、`src/__tests__/components/widgets/widgets.test.tsx`、`src/__tests__/views/ChatInput.test.tsx` — 更新后端、Widget、输入区测试,覆盖 8 张推荐、兜底补齐、自定义卡负向交互与聚焦行为。
- `tests/smoke/run-smoke*.ts` — 加固 SSE 缓冲区 drain,并让主 smoke 使用确定性 provider,保证全量回归能稳定覆盖场景选择流。
- `doc/prd.md`、`doc/knowledge/skills.md`、`doc/knowledge/styling.md`、`doc/knowledge/api-contract.md`、`doc/design/widgets/scene-cards.html`、`doc/design/styles/widget-preview.css`、`doc/design/pages/onboarding.html` — 同步产品、契约、样式知识文档和原型说明。

## 手工测试

### 后端回归

命令:

```powershell
npm run test:server
```

观察输出:

```text
Test Suites: 17 passed, 17 total
Tests:       155 passed, 155 total
Ran all test suites.
```

结论:后端回归通过。`skill-sceneSelect.test.ts` 覆盖默认返回 8 张推荐卡、候选不足或重复时确定性兜底补满 8 张、已用 topic 过滤等路径。输出中出现 `JWT_SECRET` 开发默认值 warning,为既有测试环境提示,不阻断。

### 前端回归

命令:

```powershell
npm run test:web
```

观察输出:

```text
Test Files  13 passed (13)
Tests       96 passed (96)
```

结论:前端回归通过。Widget 测试确认渲染 8 张推荐卡 + 1 张自定义卡;点击推荐卡仍发送 `select-scene`;点击自定义卡不发送 `select-scene` / `request-new-scenes`,只切回 chat 输入并请求聚焦。`ChatInput` 测试确认自定义触发后 textarea 可见并获得焦点。输出中的 profile 500 用例日志与 React Router future flag warning 为既有/预期测试输出。

### 全量回归与 smoke

命令:

```powershell
npm test
```

观察输出节选:

```text
[smoke] PASSED 6/6
[smoke:onb] PASSED 13 / 13
[smoke:learn] PASSED 13 / 13
Test Suites: 17 passed, 17 total
Tests:       155 passed, 155 total
Test Files  13 passed (13)
Tests       96 passed (96)
```

结论:全量回归通过。负样本也已覆盖:learning smoke 中 `text + action` 返回 400、`archived` 会话继续练习被拒绝;场景选择单测覆盖候选不足/重复时仍补满 8 张。

### 构建验证

命令:

```powershell
npm run build
```

观察输出:

```text
✓ 81 modules transformed.
dist-web/assets/index-C6xvWcWw.js   508.94 kB │ gzip: 149.79 kB
✓ built in 1.96s
(!) Some chunks are larger than 500 kB after minification.
```

结论:服务端 TypeScript 编译与 Vite 构建通过。500 kB chunk 为 Vite 体积提示,非本次阻断项。

### 浏览器手测

启动命令:

```powershell
npm run dev
```

观察输出:

```text
[server] Listening on http://localhost:8787
```

启动命令:

```powershell
npm run dev:web -- --host 127.0.0.1
```

观察输出:

```text
VITE v5.4.21 ready
Local: http://127.0.0.1:5173/
```

浏览器步骤:

1. 打开 `http://127.0.0.1:5173/login`,登录临时测试账号 `<EMAIL>`。
2. 进入 `http://127.0.0.1:5173/chat`,查看场景选择区域。
3. 观察九宫格按钮数量与文本。
4. 点击“自定义场景”卡片。

观察结果:

```json
{
  "buttonCount": 9,
  "customCount": 1,
  "disabledCount": 0,
  "labels": [
    "☕咖啡点单...",
    "🏨酒店入住...",
    "📚图书借阅...",
    "🏦银行业务...",
    "🩺看病问诊...",
    "🎬看电影约票...",
    "💼办公室会议...",
    "🏋️健身办卡...",
    "✏️自定义场景..."
  ],
  "afterClick": {
    "activeTag": "TEXTAREA",
    "placeholder": "直接打字告诉我...",
    "focused": true,
    "visible": true
  }
}
```

结论:浏览器手测通过。页面实际渲染 8 张推荐卡 + 1 张自定义卡,推荐卡 Emoji 不重复;点击自定义卡后输入框可见并获得焦点。测试中的本地 token 已按 `<TOKEN>` 处理,未写入文档。

### 总结

已跑过 5 / 5 步,全部通过。覆盖后端单测、前端组件/输入区测试、全量 smoke、生产构建和浏览器 UI 手测;负样本覆盖候选不足兜底、自定义卡不发后端 action、非法学习动作拒绝。

## 遗留 TODO

- [前端] 当前自定义卡只负责切回输入框,尚未增加“自定义主题输入中”的显式 UI 状态;是否需要额外提示可后续结合用户反馈决定。
- [测试] 浏览器手测采用本地预置 ready widget 数据避开真实 provider 依赖;若后续引入 Playwright E2E,可把 8+1 九宫格检查纳入自动化。
- [构建] Vite 仍提示主 chunk 超过 500 kB,与本次功能无直接关系,可在后续性能任务中处理。

## 下一阶段建议

1. **自定义场景文本路由验收**(PRD §2.5, §4.6)— 继续验证用户输入自由主题后能稳定进入对应场景练习,让第 9 张卡不仅是入口,也能闭环到练习生成。
2. **场景推荐质量评估**(PRD §2.1, §2.5)— 增加按画像、历史 topic、难度自适应生成 8 张卡的评估样本,避免兜底卡过多时推荐显得模板化。
3. **Widget 视觉回归基线**(PRD §4.7, §4.9)— 为 3x3 场景卡补桌面/移动截图基线,持续防止换行、按钮高度和窄屏布局退化。
4. **学习流恢复体验**(PRD §3.5, §5.1)— 在 SSE 或 provider 失败时,保留可重试的场景选择状态,确保九宫格不会停留在不可操作 loading 态。
