# Styling

## 入口

- 设计 token:`src/styles/tokens.css`(从 `doc/design/styles/tokens.css` 拷贝)
- 公共组件样式:`src/styles/components.css`(从 `doc/design/styles/components.css` 拷贝)
- 在 `src/main.tsx` 顶部 `import` 注入全局样式
- 主题 store:`src/stores/theme.ts`

## 关键源码

### Token 命名

- 颜色:`--color-canvas` / `--color-primary` / `--color-msg-ai-bg` / `--color-success` 等
- 字体:`--font-display` / `--font-body` / `--font-mono`
- 间距:`--space-{xxs,xs,sm,md,lg,xl,xxl,section}`
- 圆角:`--radius-{xs,sm,md,lg,xl,pill}`
- 阴影:`--shadow-{sm,md,lg,popover}`
- 布局:`--layout-top-nav` / `--layout-col-history` / `--layout-col-main` / `--layout-col-branch`

### 主题切换

- 默认跟随系统 `@media (prefers-color-scheme: dark)`
- 用户手动:`documentElement.dataset.theme = 'light' | 'dark'`,写入 `localStorage.echora-theme`
- 与原型 `doc/design/scripts/interactions.js` 共用 localStorage key

## 约束与失败点

- **不引入 Tailwind / CSS-in-JS**:沿用 prototype 的 tokens + components,统一约定
- **不要硬编码十六进制色**:用 `var(--color-...)`,否则暗色模式断
- **品牌色与语义色双主题保持一致**:primary / success / warning / error 不在暗色下变色
- **Widget 协议样式在 `widget-preview.css`**:此文件仅用于原型预览,**不**进 src/styles
- **视图局部样式用 `*.module.css`**(Vite 原生支持,002 起约定):公共组件继续 global,视图层局部样式拆模块化(class hash 隔离),示例见 `src/views/Onboarding/index.module.css`
- **Chat 滚动锚定(008)**:`src/views/Chat/MessageList.tsx` 不使用 `scrollIntoView` 锚点,而是滚到 `document.scrollingElement.scrollHeight`;同时监听 message list 的 `ResizeObserver`,在 widget 从 loading 展开成 ready 后补滚。固定输入栏下方空间由 `src/views/Chat/index.module.css` 的 `.main` / `.messageList` padding 预留。
- **Chat 思考占位(008)**:`src/views/Chat/MessageBubble.tsx` 在 assistant 流式消息内容为空时显示 "Echo 正在思考中...",配合 store 的临时 assistant 消息形成「用户消息 → 思考中 → 小部件/结果」顺序。
- **Chat SSE 错误可见(022)**:`src/stores/chat.ts` 在收到 SSE `error` 或连接放弃时,把错误写入当前 assistant 消息,避免流结束后空 assistant 气泡被 `MessageBubble` 过滤掉,造成"用户消息发出但没有回复"的假象。
- **Chat 停止生成(041)**:`src/views/Chat/ChatInput.tsx` 在 `streamingMessageId` 存在时把发送按钮切换为"停止";点击后调用 `useChatStore.stopGenerating()` → `POST /api/chat/streams/:streamId/abort`,关闭本地 EventSource 并清空流式态。若 assistant 尚无内容,前端写入"已停止生成。"避免空回复。
- **Chat 输入焦点(014)**:`src/views/Chat/ChatInput.tsx` 在提交文本/答案后设置恢复焦点标记;若此时 textarea 因 streaming 被禁用,等 `streamingMessageId` 清空且输入区可用后再把焦点放回 textarea,减少连续作答时反复点击输入框。
- **Chat 学习菜单(040)**:`src/views/Chat/ChatInput.tsx` 的左侧 `☰` 已接入可用浮层,按当前 `learning_state/input_mode` 展示"继续/开始新场景/换场景/查看复盘/复习薄弱点/保存进度"。菜单动作复用 `action:*` / `text:*` / `retry:*` / `local:save-progress` 协议;练习答题中会禁用继续、复盘和重练,避免误把控制操作当作当前题答案。
- **批改卡片 loading 与三档结果(009/021)**:`grading-result` 在 `status='ready'` 且有 `category(exact/similar/incorrect)` 或历史 `isCorrect` 前不渲染结果卡,避免先出现占位结果;等待态由 assistant 文本承载。021 起批改卡不展示百分制分数,只展示"完全正确 / 还不错 / 错误"三档,且正确或相近时不再显示"下一题"按钮,由后端自动串接下一题。
- **场景卡片 loading(011)**:`scene-cards` 在 `status='loading'` 时不渲染空候选小部件,只保留 assistant 文本;`ready` 后一次性出现卡片,`error` 时才显示恢复提示。
- **Chat widget 间距(011)**:`src/views/Chat/index.module.css` 的 `.messageRow` gap 为 16px,让 AI 文本和其下方 widget 有更清楚的呼吸感。
- **Widget loading 总防线(012/021)**:`src/views/Chat/WidgetSlot.tsx` 统一过滤 `status='loading'` 的 widget,并对 `exercise-card` / `grading-result` 做必填数据校验后才占用 widget 槽位;`grading-result` 优先校验 `category`,保留 `isCorrect` 历史兼容;`ExerciseCard` 自身也在 `ready + attemptId/stage/questionNo/questionType/contextZh` 完整前返回 `null`,避免显示"阶段 ? / 第 ? 题"半成品。
- **ProgressSummary 组件(015/016/029)**:`src/components/widgets/ProgressSummary.tsx` 正式渲染 `progress-summary`,展示题数、三档分布(完全正确/还不错/错误)、薄弱点、掌握度条、强弱项与建议。016 起建议卡片有"开始"按钮:`retry:<tag>` 转成文本 `重练 <tag>`,`request-new-scenes` 继续走结构化 action。029 起不展示平均分;`status='loading'` 或缺少 `questionsCount/averageScore` 时返回 `null`,不走 fallback JSON。
- **重练/替换题卡标签(016/024)**:`ExerciseCard` 收到内部 `stage=5` 时显示为"重练",避免把系统内部阶段编号暴露给用户;若 `data.remediationKind='replacement'`,则显示为"替换题",用于单题 2 次失败后的自动降难补救。
- **目标句块(023/026)**:`ExerciseCard` 支持 `targetZh`,用于阶段 4 `role_reversal` 和阶段 3 `dialogue_chain` 单独展示"请表达「中文目标句」"块;角色信息留在题干/提示中,避免 `Your role` 或目标意思说明比目标句更醒目。
- **题卡进度(027/045)**:`ExerciseCard` 支持 `totalStages/stageGoal/totalQuestions`,主线显示"阶段 N/4 · 第 N/M 题"并渲染短进度条;`stageGoal` 按场景难度动态变化(A1/A2:2/1/1/1,B1/B2:2/2/2/2,C1/C2:3/3/2/2)。重练显示"第 N/3 题";替换题显示"第 1/1 题"。
- **AnswerReview 组件(017)**:`src/components/widgets/AnswerReview.tsx` 正式渲染 `answer-review`,展示逐题短题干、分数 badge、题型和错误标签。`status='loading'` 或 items 为空时返回 `null`。017 起 `MessageList` 支持同一 assistant 消息多个 widget snapshot,用于复盘总览 + 单题回看连续呈现。
- **ConversationLock 组件(018)**:`src/components/widgets/ConversationLock.tsx` 正式渲染 `conversation-lock`,用于 locked 历史里的答案/批改详情占位。沿用 amber 左边框和 `--color-surface-soft`,在 `status='ready'` 且 `title/description` 完整时才显示,避免 fallback JSON。
- **FollowUpSource 组件(019)**:`src/components/widgets/FollowUpSource.tsx` 正式渲染 `follow-up-source`,用于 explain 追问前标明来源。`status='ready'` 且 `sourceLabel/snippet` 完整时才显示;未批改题显示"答题前只给提示",已批改来源显示"不改变主学习流"。
- **IntentConfirm 组件(020)**:`src/components/widgets/IntentConfirm.tsx` 正式渲染 `intent-confirm`,用于低置信度路由确认。`status='ready'` 且 `question/choices>=2` 时才显示;按钮解析 `action:*` 或 `text:*` 字符串并复用既有发送通道。
- **LearningMenu / AccountGate 组件(040)**:`src/components/widgets/LearningMenu.tsx` 与 `AccountGate.tsx` 已注册到 `WidgetRenderer`,不再走 fallback JSON。二者与 `IntentConfirm` / `ProgressSummary` 共用 `src/components/widgets/actionProtocol.ts`,统一解析 `action:request-new-scenes`、`action:next-question`、`text:<内容>` 与 `retry:<tag>`。
- **辅助追问右侧面板(031/044)**:`src/views/Chat/BranchPanel.tsx` 渲染桌面右侧支线;`MessageBubble` 在非 streaming 主线消息内显示"追问"入口,当前追问来源用 `bubbleReferenced` 高亮。桌面宽屏下 `shellWithBranch` 把主区与 360px 支线组成两列,并把固定输入栏右侧收进主区;窄屏下支线用 fixed 面板覆盖,主输入栏暂时隐藏,避免两套输入重叠。044 起,已批改且带错误标签的来源会显示"加入复盘"按钮,成功后在来源块内显示确认文案。
- **新一轮会话切换(046)**:`useChatStore` 在 `/chat/send` 返回新的 `conversationId` 时会切换当前消息列表,清空上一轮 active widget 与支线面板状态,并刷新历史栏;旧会话在历史栏显示为 `已归档`,新会话显示正在生成的新一轮场景内容。
- **历史会话左栏/抽屉(034/035/037/039)**:`src/views/Chat/HistoryPanel.tsx` 在 960px 以上显示左侧 260px 历史会话栏,可切换当前会话,035 起提供"新建对话"入口;037 起 Chat store 在收到 `state-transition` 后刷新 conversations,用于同步场景标题和学习态。039 起 960px 以下通过顶栏 `☰` 打开历史抽屉,切换会话或新建会话后自动关闭。主输入栏同步从左侧让出 260px。1280px 以上且支线打开时形成 260px 历史栏 + 主学习流 + 360px 支线三栏。

## 测试入口

- 视觉回归测试 V1 不做(后续可接 Chromatic / Percy)
- 主题切换通过手工烟雾验证:启动 dev:web → 点 🌙/☀ 切换 → `localStorage.echora-theme` 被写入
- Chat 滚动行为:`src/__tests__/views/MessageList.test.tsx`
- Chat 消息顺序/思考占位:`src/__tests__/stores/chat.test.ts` + `src/__tests__/views/MessageBubble.test.tsx`
- Chat SSE 错误显示:`src/__tests__/stores/chat.test.ts`
- Chat 停止生成:`src/__tests__/stores/chat.test.ts` + `src/__tests__/views/ChatInput.test.tsx` + `server/__tests__/chat-route.test.ts`
- Chat 输入焦点恢复:`src/__tests__/views/ChatInput.test.tsx`
- 批改卡片 loading:`src/__tests__/components/widgets/widgets.test.tsx`
- 场景卡片 loading:`src/__tests__/components/widgets/widgets.test.tsx`
- 题卡 loading 与 widget 槽位过滤:`src/__tests__/components/widgets/widgets.test.tsx` + `src/__tests__/views/WidgetSlot.test.tsx`
- progress-summary 渲染:`src/__tests__/components/widgets/widgets.test.tsx`
- answer-review 渲染与多 widget 消息:`src/__tests__/components/widgets/widgets.test.tsx` + `src/__tests__/views/MessageList.test.tsx`
- conversation-lock 渲染:`src/__tests__/components/widgets/widgets.test.tsx`
- follow-up-source 渲染:`src/__tests__/components/widgets/widgets.test.tsx`
- intent-confirm 渲染与点击动作:`src/__tests__/components/widgets/widgets.test.tsx`
- learning-menu / account-gate 渲染与点击动作:`src/__tests__/components/widgets/widgets.test.tsx`
- Chat 学习菜单:`src/__tests__/views/ChatInput.test.tsx`
- 辅助追问入口、加入复盘按钮与支线 store:`src/__tests__/views/MessageList.test.tsx` + `src/__tests__/views/BranchPanel.test.tsx` + `src/__tests__/stores/chat.test.ts`
- 历史会话左栏:`src/__tests__/views/HistoryPanel.test.tsx`

## Pending

- 未来 12 Widget 实现时是否拆出 `src/styles/widgets/` 子目录
