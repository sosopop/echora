# 07. 验收与迭代路线

## 1. V1 MVP 验收标准

### 1.1 用户画像与场景选择

- [ ] 新用户注册后自动触发 `onboarding` Skill，AI 对话式收集姓名、年龄、年级、英语水平
- [ ] 用户可通过自然语言回答或跳过任意问题
- [ ] `onboarding` 完成后自动触发 `scene-select` Skill
- [ ] `scene-select` 基于用户画像展示 3-5 个场景卡片 Widget
- [ ] 用户可点击卡片选择场景，或输入自定义场景描述
- [ ] 用户说"换个场景"时重新触发 `scene-select`

### 1.2 Skill 体系

- [ ] 所有功能通过 Skill 实现，Skill 通过 Registry 注册
- [ ] 新增 Skill 只需定义 + 注册，不改路由核心代码
- [ ] 每个 Skill 声明 `allowedStates` 和可能的 `nextStates`，系统按状态机校验调用合法性
- [ ] 内部 AI 调度能正确根据用户输入匹配 Skill（准确率 > 80%）
- [ ] 低置信度时前端展示自然的下一步确认选项，不显示 confidence 数字
- [ ] 输入框左侧学习菜单可发送结构化动作，不要求用户输入命令
- [ ] Skill 执行结果通过内部流式传输实时输出，用户界面不出现协议术语
- [ ] Skill 可定义关联的 Widget 和输入模式
- [ ] 登录注册、保存、新建会话、提交答案、会话锁定和权限判断由系统确定性执行，不由 AI 直接改写

### 1.3 练习功能

- [ ] `practice` Skill 按需生成场景对话和练习题
- [ ] 支持多种题型：单词填空、短语填空、半句翻译、整句翻译、选择填空
- [ ] 输入框根据题型自动切换模式（fill / chat / select）
- [ ] 用户提交答案后系统创建 `exercise_attempts`，再触发 `grade` Skill 流式批改
- [ ] 批改卡片包含：得分、正确/错误标识、参考答案、中文解析、错误标签
- [ ] 批改完成后写入 `grading_results` 与 `error_tag_events`
- [ ] 批改卡片下方有快捷按钮（追问、再来一道）
- [ ] 用户可通过自然语言或快捷按钮追问（`explain` Skill）
- [ ] 辅助追问只能解释源上下文，不改变主学习流状态；切换场景、生成新题、复盘必须回到主学习流确认
- [ ] 用户可通过自然语言切换场景、跳过题目、结束练习
- [ ] 一轮练习（5-10 题）后 AI 主动小结

### 1.4 复盘与重练

- [ ] 学习菜单或自然语言查询触发 `review` Skill
- [ ] 复盘以文字 + `progress-summary` Widget 呈现
- [ ] 复盘内容基于 `exercise_attempts`、`grading_results`、`error_tag_events`，不编造，不从消息展示文本临时解析
- [ ] 学习菜单或自然语言触发 `retry` Skill
- [ ] 重练针对 `error_tag_events` 中的历史薄弱点生成新题

### 1.5 数据持久化

- [ ] 用户画像正确保存和更新
- [ ] 所有消息完整持久化（含流事件）
- [ ] 刷新页面后恢复最近会话的完整消息列表和 Widget 状态
- [ ] Widget 快照包含 `widgetId`、`widgetType`、`widgetData`、`widgetState`、`actions`、`status`、`sourceRef`、`createdBySkill`
- [ ] `exercise_attempts`、`grading_results`、`error_tag_events` 正确写入并可用于复盘/重练
- [ ] 向上滚动分页加载历史消息
- [ ] 左侧历史会话列表可切换 active / archived 会话
- [ ] 右侧辅助追问可从主消息打开，并在刷新后恢复 source 上下文
- [ ] 学习菜单可归档当前会话并创建新会话；练习中旧会话只读或暂不可进入

### 1.6 用户系统

- [ ] 邮箱注册 + 登录 + JWT 鉴权
- [ ] 登出后清除本地会话状态

### 1.7 输入框模式

- [ ] chat 模式：自由输入，Enter 发送
- [ ] fill 模式：显示句子模板 + 空位高亮，用户填词
- [ ] select 模式：选项按钮组，点击即触发
- [ ] menu 模式：点击输入框左侧按钮打开学习菜单，支持键盘选择和 Esc 关闭

### 1.8 Widget 渲染

- [ ] 场景卡片 Widget 正确渲染，点击触发场景选择
- [ ] `exercise-card`、`fill-blank`、`choice-question` 能承载正式练习输入
- [ ] 批改结果 Widget 正确渲染，区分正确/部分正确/错误
- [ ] 进度摘要 Widget 正确渲染
- [ ] `answer-review`、`intent-confirm`、`learning-menu`、`account-gate`、`follow-up-source`、`conversation-lock` 有明确可视状态
- [ ] 主消息中的“追问/解析”动作能打开右侧辅助追问
- [ ] Widget 通过内部流式事件增量构建；用户只看到友好生成状态
- [ ] Widget 交互状态在刷新后持久化恢复
- [ ] Widget 生命周期覆盖 `loading`、`ready`、`disabled`、`submitted`、`expired`、`error`

### 1.9 难度自适应

- [ ] AI 根据用户表现隐式调整出题难度
- [ ] 用户可通过对话查询当前水平（自然语言）
- [ ] 用户说"太难了"/"太简单了"时立即调整

### 1.10 技术验收

- [ ] 前端 `npm run test:web` 通过
- [ ] 后端 `npm run test:server` 通过
- [ ] 冒烟测试覆盖：注册 → onboarding → 场景选择 → 练习 → 批改 → 追问 → 复盘 → 刷新恢复
- [ ] 内部流断线自动重连，前端显示"正在恢复连接"
- [ ] AI JSON 输出有 schema 校验
- [ ] 校验失败自动重试（最多 2 次）
- [ ] 数据库迁移可从空库完整执行

### 1.11 UI 验收

- [ ] 桌面端为历史会话 / 主聊天 / 辅助追问三栏工作台，主聊天保持 720px 可读宽度
- [ ] 移动端全宽适配，历史和辅助追问通过抽屉或 tabs 打开，输入区跟随键盘
- [ ] 色彩、字体、圆角符合设计系统
- [ ] Widget 视觉区分清晰
- [ ] 流式文本呈现流畅
- [ ] 输入模式切换无闪烁
- [ ] 用户可见 UI 不出现 `SSE`、`command`、`AI Router confidence`、`Skill event stream` 等工程术语

## 2. 用户体验验收

> **新用户从注册到开始第一道题 < 2 分钟。**
> **用户不需要阅读任何文档、不需要看任何引导页、不需要学习任何界面操作。**

测试场景：
1. 一个 15 岁初三学生，首次使用 → 3 轮对话内开始做题
2. 一个 25 岁职场人，只说"我想练商务邮件" → 直接获得商务场景练习
3. 一个老用户登录 → 3 秒内看到上次对话 + AI 推荐下一步

## 3. 成功指标

| 指标 | 目标 |
|------|------|
| 新用户到首次答题 | < 2 分钟 |
| AI Skill 调度准确率 | > 80%（人工评估 20 个场景） |
| 内部流首字节时间 | < 1s |
| AI 批改首字时间 | < 3s |
| Skill 执行失败率 | < 5% |
| 消息丢失率 | 0%（刷新后完整恢复） |

## 4. 里程碑

| 里程碑 | 目标 | 产出 |
|--------|------|------|
| M1 工程骨架 | 项目搭建、Auth、DB migrations、内部流式基础 | 可注册登录、基础实时生成 |
| M2 Skill 框架 | Skill Registry、AI 调度、Skill 事件流 | 可注册 Skill、AI 调度到 Skill |
| M3 Onboarding + Scene | onboarding Skill、scene-select Skill、SceneCards Widget | 用户画像收集、场景选择 |
| M4 练习闭环 | practice Skill、grade Skill、fill/chat 模式 | 可答题、批改、追问 |
| M5 复盘闭环 | review Skill、retry Skill、ProgressSummary Widget | 可查看进度、重练错题 |
| M6 UI 打磨 | 响应式适配、动画、异常状态 | 桌面+移动端完整可用 |
| M7 验收发布 | 测试覆盖、冒烟、构建、部署说明 | V1 MVP 可试用版本 |

## 5. V1.1 迭代方向

| 功能 | 说明 |
|------|------|
| `voice-input` Skill | 语音转文字 |
| `listen-fill` Skill | 听力填空 |
| 消息搜索 | 搜索历史对话关键词 |
| 会话重命名 | 手动编辑会话标题 |
| 学习提醒 | 每日/每周学习提醒 |

## 6. V1.5 迭代方向

| 功能 | 说明 |
|------|------|
| `speak` Skill | TTS 朗读英文句子 |
| `choice` Skill | 选择题练习 |
| `roleplay` Skill | AI 角色扮演对话 |
| 数据导出 | 导出学习记录 JSON/PDF |

## 7. V2 迭代方向

| 功能 | 说明 |
|------|------|
| `pronounce` Skill | 用户录音 + AI 发音评分 |
| `live-chat` Skill | 实时英语对话（ASR + TTS） |
| 学习计划 Skill | AI 制定阶段性学习计划 |
| 多 Agent | 不同风格的 AI 教练 |

## 8. Skill 扩展路线图

```
V1 MVP         V1.1            V1.5            V2
─────────────────────────────────────────────────────
onboarding     voice-input     speak           pronounce
scene-select   listen-fill     choice          live-chat
practice       search          roleplay        study-plan
grade                                        multi-agent
explain
review
retry
general-chat
```

## 9. 架构扩展预留

V1 MVP 的 Skill 架构应为后续扩展预留：

1. **Skill 热注册**：后续可在不重启服务的情况下动态注册 Skill
2. **Skill 市场**：社区可贡献自定义 Skill（如"考研英语专项"）
3. **Widget 类型扩展**：新增 Widget 类型时，前端 WidgetRenderer 支持动态加载
4. **多 Provider**：AI Router 和 Skill 可指定不同的 AI Provider
5. **Skill 组合**：一个 Skill 可调用另一个 Skill（如 `review` 调用 `explain` 解释某个薄弱点）
