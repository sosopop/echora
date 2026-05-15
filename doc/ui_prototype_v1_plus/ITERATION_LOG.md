# Echora V1 Plus 原型迭代记录

> 需求层的主迭代记录见 `../requirements_v1/10-product-workflow-iteration-log.md`。本文只记录原型层调整，且所有结论都是当前轮判断，不代表需求已经最终收敛。

## 迭代 1：全量按钮与交互审计

时间：2026-05-15

### 检查范围

- `index.html`
- `demo.html`
- `widgets.html`
- `workflows.html`
- `assets/scripts.js`
- `assets/styles.css`

### 发现

- `demo.html` 的核心学习流按钮基本有明确绑定：顶部动作、历史切换、学习菜单、输入区、辅助追问、填空提交都能落到原型行为。
- `widgets.html` 中大量按钮仅作为视觉展示，缺少明确 action 说明，包括场景卡片、提示、跳过、提交、选择题、登录注册等。
- `workflows.html` 中边界流程里的按钮也偏静态展示，缺少“点击后代表什么系统动作”的反馈。
- `demo.html` 中“自定义场景”误用为直接进入练习，容易让实现误解为不需要收集自定义描述。
- 新建学习流按钮只有图标和 aria-label，没有明确原型反馈。

### 产品反思

Widget 展示页和工作流展示页可以不是完整真实交互，但每个按钮必须表达清楚“它代表哪个 action、由 AI 还是系统处理、是否影响主线”。否则展示页会误导实现者，把静态视觉误当成未定义功能。

### 修改方向

- 所有展示页按钮补充明确原型 action 反馈。
- `demo.html` 中“自定义场景”改为切回自然输入，而不是直接开始练习。
- 新建学习流按钮补充确定性系统动作反馈。

## 迭代 2：MVP 分支收敛

### 保留

- 主线状态：`onboarding`、`scene_selecting`、`practicing`、`grading`、`awaiting_next`、`reviewing`、`archived`。
- Widget：保留 12 个 V1 Widget，不再新增额外 Widget。
- 账号入口：统一收敛到 `account-gate`，负责登录、注册、保存进度的对话内入口；真实鉴权仍由系统执行。
- 辅助追问：只解释来源上下文，不生成下一题，不改变主学习流。

### 砍掉或避免

- 不做展示页里的真实表单校验、真实登录、真实数据保存。
- 不做旧式 Dashboard / 错题本 / 设置页。
- 不在原型里暴露内部路由、协议、事件名或技术调试控制台。
- 不把辅助追问中的“再来一题”直接执行为主线动作。

### 产品反思

MVP 的重点不是让每个展示页按钮都执行完整业务，而是让每个按钮都能映射到明确的系统 action 或 Widget action。真正完整的连续体验只放在 `demo.html`，展示页负责解释契约与边界。

## 迭代 3：验证与收口

### 修改

- `assets/scripts.js` 的动态按钮绑定增加幂等标记，避免 demo 消息重新渲染后重复触发。
- `workflows.html` 新增 MVP Action Matrix，把每个主状态允许的动作和系统结果写清楚。
- 展示页里的静态按钮统一通过 `data-prototype-toast` 表达对应 Widget action / Menu action / Account action。

### 已验证项

- 每个 HTML 按钮都有 `data-*` 行为、导航 href、id 绑定或明确展示反馈。
- 12 个 Widget 均在 `widgets.html` 展示。
- 7 个状态均在 `workflows.html` 展示。
- 禁用词不出现在用户可见原型中。
- `assets/scripts.js` 语法检查通过。

### 验证命令

```text
node --check doc\ui_prototype_v1_plus\assets\scripts.js
button audit: all buttons have explicit action/feedback/id binding
widget coverage: widgets ok: 12
flow coverage: flows ok: 7
```

### 当前轮判定（非最终）

当前原型的主线分支已经收敛为 MVP 可落地范围：

- 主线动作只发生在中间学习流。
- 辅助追问只解释，不改变主线。
- 登录/注册/保存统一归入 `account-gate`。
- 展示页按钮只表达 action 契约，不伪装成完整业务实现。
- 难以落地的完整表单校验、真实鉴权、真实数据保存、旧式多页面学习平台均不进入本原型。

### 后续判定标准

如果后续再发现按钮无法解释为明确 action，则优先补充显式反馈；如果该按钮不属于 MVP，则删除而不是保留悬空入口。

## 迭代 4：需求树发散展示

### 触发

用户明确要求迭代不应被限定为最终完成，每个问题都可以生成多个目标方向，包含 MVP、候选、暂不做和砍掉项。

### 原型反思

真实演示页应该像上线产品，不应塞入候选分支；但工作流展示页可以承担“产品树解释”的职责，把主线、候选、暂不做和已砍掉项清楚分层。

### 修改

- `workflows.html` 增加“主线稳定，分支开放生长”区域。
- 增加 `MVP 保留`、`MVP 收敛`、`后续候选`、`暂不做`、`已砍掉` 状态标记。
- `README.md` 明确 demo 只展示 MVP 路径，workflows 展示取舍状态。

<!-- Previous checklist kept for traceability.
- 每个 HTML 按钮都有 `data-*` 行为、导航 href、id 绑定或明确展示反馈。
- 12 个 Widget 均在 `widgets.html` 展示。
- 7 个状态均在 `workflows.html` 展示。
- 禁用词不出现在用户可见原型中。
- `assets/scripts.js` 语法检查通过。

-->
