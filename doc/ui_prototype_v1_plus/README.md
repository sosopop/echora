# Echora V1 Plus HTML Prototype

这套原型基于 `doc/requirements_v1/` 和 `doc/requirements_v1/DESIGN.md`，用于验证 Echora V1 Plus 的 AI 学习流工作台、Widget 契约、工作流状态机和明暗主题。

## 页面

| 页面 | 说明 |
|------|------|
| `index.html` | 原型入口页，导航到完整演示、Widget 展示和工作流展示 |
| `demo.html` | 接近实际上线效果的产品演示页：左历史、中主学习流、右辅助追问、底部交互区 |
| `widgets.html` | 12 个 V1 Widget 的专门展示页，并支持切换生命周期状态 |
| `workflows.html` | 展示学习流状态机和关键边界流程 |

## 覆盖范围

- 主学习流：onboarding、场景选择、练习、批改、等待下一步、复盘、历史归档。
- Widget：`scene-cards`、`exercise-card`、`fill-blank`、`choice-question`、`grading-result`、`progress-summary`、`answer-review`、`intent-confirm`、`learning-menu`、`account-gate`、`follow-up-source`、`conversation-lock`。
- 辅助追问：围绕题目、批改、复盘等来源解释，不改变主线。
- 会话锁定：练习中旧会话可见但答案和批改详情受限。
- 明暗主题：默认跟随系统偏好，用户切换后写入 `localStorage`。

## 设计约束

- 视觉基准来自 `doc/requirements_v1/DESIGN.md`。
- Light 使用 cream canvas `#faf9f5`；Dark 使用 dark product surface `#181715`。
- Coral `#cc785c` 只用于主要 CTA 和少量强调。
- Display 使用 serif fallback；正文和 UI 使用 Inter / system sans。
- 按钮和输入 8px 圆角；内容卡片 12px 圆角；badge 使用 pill。
- 不引入外部原型框架、不使用旧 Dashboard 多页面学习平台结构。

## 注意

本目录为按当前 V1 Plus 需求重新整理的独立原型。不要查看、引用或复用 `doc/ui_prototype_v1/`。
