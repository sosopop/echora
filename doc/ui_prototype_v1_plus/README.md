# Echora V1 Plus HTML Prototype

入口：`index.html`

这套原型基于 `doc/requirements_v1/`，展示 Echora V1 MVP 的核心产品形态：

- 单聊天页，不拆成旧式多页面学习平台。
- 桌面为聊天工作台：左侧历史对话列表，中间主学习流，右侧辅助追问。
- 所有学习能力以自然对话和小部件呈现：初次了解、场景推荐、练习、批改、解释、复盘、薄弱点重练、学习菜单。
- 复杂交互以小部件嵌入消息流：场景卡片、填空题、批改卡片、复盘摘要、下一步确认。
- 主消息中的题目、批改和复盘都可以打开右侧辅助追问，针对现有上下文继续问句子、单词、错题、语法点、推荐答案或场景。
- 输入区根据上下文切换：自然输入、填空、选项、学习菜单。
- 暗色 product surface 展示友好的 AI 处理过程，例如“理解你的目标 → 选择合适练习 → 生成互动卡片 → 准备下一步”。

设计约束来自 `DESIGN.md`：

- cream canvas：`#faf9f5`
- coral CTA：`#cc785c`
- dark product surface：`#181715`
- serif display headline + sans body
- 8px buttons/inputs、12px cards、pill badges
- 克制阴影，主要通过 surface 层次表达结构

注意：本目录为按当前 v1 需求重新生成的独立原型。
