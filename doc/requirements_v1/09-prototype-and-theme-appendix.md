# 09. 原型与主题设计附录

## 1. 目标

本文定义 `doc/ui_prototype_v1_plus/` 静态原型的页面结构、明暗主题策略、色彩搭配和验收口径。原型用于验证 V1 Plus 的 AI 学习流、Widget 契约和产品界面表达，不替代 `DESIGN.md`。

所有视觉实现必须以 `DESIGN.md` 为唯一设计基准，并在静态 HTML/CSS/JS 中直接落地。

## 2. 原型页面结构

| 页面 | 作用 | 说明 |
|------|------|------|
| `index.html` | 原型入口 | 只负责介绍与导航，链接到完整演示、Widget 展示、工作流展示 |
| `demo.html` | 完整产品演示 | 尽量接近实际上线页面：左历史、中主学习流、右辅助追问、底部交互区 |
| `widgets.html` | Widget 展示 | 展示全部 V1 Widget 与生命周期状态 |
| `workflows.html` | 工作流展示 | 展示状态机、系统确定动作、辅助追问和会话锁定等边界流程 |

`demo.html` 不展示原型调试控件、状态切换器或工程说明。它只保留用户实际上线后会看到的界面与交互。

## 3. 主题与色彩

原型必须支持明暗两种主题：

| 主题 | 主要画布 | 主要表面 | 使用场景 |
|------|----------|----------|----------|
| Light | `#faf9f5` cream canvas | `#f5f0e8` / `#efe9de` | 默认学习界面、入口页、Widget 展示 |
| Dark | `#181715` dark product surface | `#252320` / `#1f1e1b` | 暗色产品工作台、深色演示、代码/处理过程表面 |

共同规则：

- 主 CTA 使用 coral `#cc785c`，active 使用 `#a9583e`。
- 文本遵守 `DESIGN.md` 的 warm ink / cream-on-dark 体系。
- Display 标题使用 serif fallback；正文和 UI 使用 Inter / system sans。
- 按钮和输入框圆角为 8px；内容卡片圆角为 12px；badge 使用 pill。
- 阴影克制，优先用 cream / dark surface 的层级表达结构。
- 不使用大面积蓝紫渐变、纯白 canvas、冷灰 SaaS 背景或与 `DESIGN.md` 冲突的色彩。

主题切换策略：

- 默认跟随系统偏好。
- 用户手动切换后写入 `localStorage`。
- 所有原型页面共享同一主题选择。

## 4. Widget 展示要求

`widgets.html` 必须展示全部 V1 Widget：

`scene-cards`、`exercise-card`、`fill-blank`、`choice-question`、`grading-result`、`progress-summary`、`answer-review`、`intent-confirm`、`learning-menu`、`account-gate`、`follow-up-source`、`conversation-lock`。

每个 Widget 至少展示：

- 用途
- 默认视觉状态
- 典型 action
- 是否影响主学习流
- 是否持久化

页面必须支持查看 Widget 生命周期：

`loading`、`ready`、`disabled`、`submitted`、`expired`、`error`。

## 5. 工作流展示要求

`workflows.html` 必须展示完整状态机：

```text
onboarding
  → scene_selecting
  → practicing
  → grading
  → awaiting_next
  → reviewing
  → archived
```

同时展示以下边界流程：

- AI 建议 + 系统确定动作
- 练习中旧会话答案/批改锁定
- 辅助追问不改变主线
- 学习菜单触发结构化动作
- 账号登录 / 注册 / 保存入口
- 低置信度意图确认

## 6. 用户可见文案边界

原型用户界面不得出现以下工程术语：

- `SSE`
- `command`
- `AI Router confidence`
- `Skill event stream`
- `/practice`
- `/review`
- `source: msg_042`

对应文案应使用：

- "Echo 正在生成"
- "正在准备互动卡片"
- "需要确认下一步"
- "AI 处理过程"
- "来自：这次批改"
- "学习进度已保存"

## 7. 验收口径

- 页面间所有链接有效。
- `demo.html` 视觉上像真实产品页面，不像调试控制台。
- `widgets.html` 覆盖全部 12 个 Widget。
- `workflows.html` 覆盖全部 7 个学习流状态和关键边界流程。
- 明暗主题在所有页面生效，并在刷新后保持选择。
- 桌面、平板、移动宽度下文本不溢出，按钮不挤压，三栏布局可自然折叠。
- 不查看、不引用、不复用 `doc/ui_prototype_v1/`。
