/* ============================================================
   Echora V1 Plus Prototype interactions
   Theme, demo learning flow, widget states, workflow explorer
   ============================================================ */

const demoStates = {
  onboarding: {
    title: '初次见面 · 正在建立学习档案',
    flow: '当前：了解你',
    mode: '交互：自然对话',
    inputMode: 'chat',
    status: 'ready',
    messages: [
      { type: 'system', text: '新用户首次进入，Echo 自动创建一条新的学习流。' },
      {
        type: 'ai',
        text: '嗨，我是 Echo，你的 AI 英语教练。开始之前，我想先简单了解你，这样后面的场景和题目会更贴近你的情况。',
        widget: {
          type: 'profile-card',
          title: '学习档案收集中',
          rows: [
            ['姓名', '小明'],
            ['年龄 / 阶段', '15 岁 · 初三'],
            ['英语水平', '中考模拟 100/120，语法偏弱'],
            ['学习目标', '中考 + 日常交流'],
          ],
        },
        actions: [
          { label: '继续推荐场景', state: 'scene' },
          { label: '我想直接开始', state: 'practice' },
        ],
      },
      {
        type: 'user',
        text: '我叫小明，15岁，初三。英语大概及格线上面一点，语法比较弱。',
      },
    ],
  },
  scene: {
    title: '场景选择 · Echo 正在推荐练习方向',
    flow: '当前：选择场景',
    mode: '交互：点击选择',
    inputMode: 'select',
    status: 'thinking',
    followUp: 'scene',
    messages: [
      { type: 'system', text: 'Echo 正在根据你的年龄、年级、目标和薄弱点准备推荐。' },
      {
        type: 'ai',
        text: '根据你的年龄、年级和“语法偏弱”的情况，我推荐这几个场景。它们都能自然训练常见句型，不会像刷题一样干。',
        widget: {
          type: 'scene-cards',
          scenes: [
            { icon: 'utensils', title: '餐厅点餐', desc: '练习 would like、一般疑问句和礼貌表达。', tags: ['B1', 'would like', '礼貌请求'], selected: true },
            { icon: 'school', title: '校园对话', desc: '围绕作业、社团和老师沟通，训练一般现在时。', tags: ['A2-B1', '情态动词', '一般现在时'] },
            { icon: 'map', title: '旅行问路', desc: '练习 there be、介词搭配和宾语从句语序。', tags: ['A2', '介词', '语序'] },
            { icon: 'library', title: '图书馆借书', desc: '训练 can/could、到期归还和礼貌请求。', tags: ['A2', 'can/could', '日常表达'] },
          ],
        },
        steps: ['理解你的目标', '匹配适合的生活场景', '生成互动卡片', '等待你选择下一步'],
        actions: [
          { label: '随便来一个', state: 'practice' },
          { label: '我想自己描述', mode: 'chat' },
        ],
      },
    ],
  },
  practice: {
    title: '练习中 · 餐厅点餐',
    flow: '当前：第 1 题',
    mode: '交互：填空',
    inputMode: 'fill',
    status: 'ready',
    followUp: 'grammar',
    messages: [
      { type: 'ai', text: '我们来练“餐厅点餐”。场景是：你在一家小餐馆点牛排套餐，需要说明熟度和配菜。' },
      {
        type: 'ai',
        text: '第 1 题先热身，只填一个核心动词。底部交互区已经切换成填空模式。',
        widget: {
          type: 'practice-question',
          stage: '单词填空',
          questionZh: '我想要点一份五分熟的牛排。',
          template: 'I would like to _____ a medium steak.',
          tags: ['食物词汇', 'would like to', 'B1'],
        },
        actions: [
          { label: '解析这道题', followUp: 'grammar' },
          { label: '给点提示', toast: '提示：这个动词也可以表示“订购”。' },
          { label: '跳过', state: 'grade' },
          { label: '换个场景', state: 'scene' },
        ],
      },
    ],
  },
  grade: {
    title: '批改后 · 这次表达基本清楚',
    flow: '当前：批改结果',
    mode: '交互：自然对话',
    inputMode: 'chat',
    status: 'thinking',
    followUp: 'politeness',
    messages: [
      { type: 'user', text: 'I want a medium steak with fries and salad.', label: '你的答案' },
      {
        type: 'ai',
        text: '不错，意思完全清楚。这里我只挑两个最值得马上修正的小点。',
        widget: {
          type: 'grading-result',
          score: 85,
          status: '部分正确',
          userAnswer: 'I want a medium steak with fries and salad.',
          referenceAnswer: "I'd like a medium steak with fries and a salad.",
          corrections: [
            ['I want', "I'd like", '点餐时更礼貌、自然。'],
            ['salad', 'a salad', '这里 salad 是一份沙拉，可数名词需要冠词。'],
          ],
          tags: ['礼貌表达', '冠词'],
        },
        steps: ['读取你的答案', '对照参考表达', '找出最值得改的点', '准备下一道类似题'],
        actions: [
          { label: '为什么 want 不够礼貌？', followUp: 'politeness' },
          { label: '冠词也解释一下', followUp: 'article' },
          { label: '再来一道类似的', state: 'practice' },
        ],
      },
      { type: 'ai', text: '如果你想追问某个点，我会在右侧打开辅助追问。主线练习会保持在这里，不会被带偏。' },
    ],
  },
  review: {
    title: '复盘 · 这一轮已经完成',
    flow: '当前：学习复盘',
    mode: '交互：自然对话',
    inputMode: 'chat',
    status: 'saved',
    followUp: 'review',
    messages: [
      {
        type: 'ai',
        text: '这轮练习完成。你一共做了 8 道题，整体表现稳定，主要问题集中在冠词和礼貌表达。',
        widget: {
          type: 'progress-summary',
          stats: [['8', '完成题数'], ['82', '平均分'], ['2', '主要薄弱点']],
          strengths: ['词汇选择准确', '基本语序稳定'],
          weaknesses: ['冠词：a/an/the 漏了 3 次', '礼貌表达：点餐语气偏直接'],
          suggestion: '下一轮建议练“酒店入住”，也会自然出现冠词和礼貌请求。',
        },
        actions: [
          { label: '继续练习', state: 'practice' },
          { label: '换个场景', state: 'scene' },
          { label: '复习薄弱点', state: 'retry' },
          { label: '追问薄弱点', followUp: 'review' },
        ],
      },
      {
        type: 'ai',
        text: '复盘仍然留在同一条学习流里。你可以继续往下练，也可以从左侧回看已完成的历史对话。',
        steps: ['汇总本轮题目', '提取常见错因', '生成下一轮建议', '保存学习进度'],
      },
    ],
  },
  retry: {
    title: '薄弱点重练 · 冠词和礼貌表达',
    flow: '当前：针对性重练',
    mode: '交互：自然对话',
    inputMode: 'chat',
    status: 'ready',
    followUp: 'review',
    messages: [
      {
        type: 'ai',
        text: '我会根据你最近的错误标签生成新题，不是简单重复原题。今天先练冠词和礼貌表达。',
        widget: {
          type: 'practice-question',
          stage: '重练 · 整句翻译',
          questionZh: '我想要一间安静一点的房间，可以吗？',
          template: 'Please translate the full sentence.',
          tags: ['礼貌表达', '冠词', '酒店入住'],
        },
        actions: [
          { label: '提交示例答案', state: 'grade' },
          { label: '换成餐厅场景', state: 'practice' },
        ],
      },
    ],
  },
  menu: {
    title: '学习菜单 · 选择下一步',
    flow: '当前：等待选择',
    mode: '交互：学习菜单',
    inputMode: 'menu',
    status: 'ready',
    messages: [
      { type: 'system', text: '学习菜单从输入框左侧打开，用来快速选择下一步，不需要记住任何特殊写法。' },
      {
        type: 'ai',
        text: '你可以继续练习、查看复盘、复习薄弱点，或者换一个更想练的场景。我会根据当前状态接着往下安排。',
        widget: {
          type: 'intent-confirm',
          intents: [
            ['开始练习', '继续生成适合当前水平的题目', 'practice'],
            ['查看复盘', '总结最近表现和薄弱点', 'review'],
            ['换个场景', '重新挑一个更合适的话题', 'scene'],
          ],
        },
      },
    ],
  },
};

const followUpThreads = {
  default: {
    sourceBadge: '来自：主学习流',
    sourceText: '从主学习流里的题目、批改、场景或复盘点击追问后，这里会打开临时支线。',
    placeholder: '选择主学习流中的追问入口...',
    messages: [{ type: 'ai', meta: 'Echo · 辅助追问', text: '这里适合临时问一个句子、单词、错题、语法点、推荐答案或场景设定。主线练习会保持不变。' }],
  },
  scene: {
    sourceBadge: '来自：场景推荐',
    sourceText: '当前追问围绕推荐场景展开，包含你的画像、候选场景和难度约束。',
    placeholder: '追问为什么推荐这个场景...',
    messages: [
      { type: 'ai', meta: 'Echo · 场景解释', text: '我推荐“餐厅点餐”是因为它能自然覆盖 would like、可数名词冠词和礼貌请求，而且题目长度适合初三学生。' },
      { type: 'user', meta: '你', text: '如果换成旅行场景，还能练同样的问题吗？' },
      { type: 'ai', meta: 'Echo', text: '可以。旅行问路会更偏介词和语序，礼貌请求也会出现，比如 “Could you tell me where the station is?”。' },
    ],
  },
  grammar: {
    sourceBadge: '来自：这道题',
    sourceText: '当前追问围绕填空题展开，包含原题、目标答案、题型和知识点标签。',
    placeholder: '追问题目、单词或语法点...',
    messages: [
      { type: 'ai', meta: 'Echo · 题目解释', text: '这道题的关键不是 “steak” 这个词，而是 “would like to + 动词原形”。所以空里应填 order。' },
      { type: 'ai', meta: 'Echo', text: '如果你想问某个词，我也可以只围绕这道题里的 order、medium、steak 做解释。' },
    ],
  },
  politeness: {
    sourceBadge: '来自：这次批改',
    sourceText: '当前追问围绕批改结果展开，包含你的答案、参考表达和本次错因。',
    placeholder: '继续追问这处批改...',
    messages: [
      { type: 'ai', meta: 'Echo · 批改解释', text: '“I want” 语法没错，但在服务场景里像直接提出要求；“I’d like” 会把语气变成礼貌请求。' },
      { type: 'user', meta: '你', text: '那和 Could I have 有什么区别？' },
      { type: 'ai', meta: 'Echo', text: '“I’d like” 是自然点餐表达；“Could I have” 更像向对方请求许可，礼貌程度更高，也更适合第一次开口。' },
    ],
  },
  article: {
    sourceBadge: '来自：冠词错误',
    sourceText: '当前追问聚焦 salad 在这句话里的可数用法。',
    placeholder: '追问 a/an/the 的使用...',
    messages: [{ type: 'ai', meta: 'Echo · 语法解释', text: '这里的 salad 指“一份沙拉”，是可数名词短语，所以更自然的是 “a salad”。如果说泛指沙拉这种食物，才可能不用冠词。' }],
  },
  review: {
    sourceBadge: '来自：复盘摘要',
    sourceText: '当前追问围绕本轮错因、薄弱标签、推荐重练方向和下一轮建议展开。',
    placeholder: '追问我的薄弱点或下一轮练习...',
    messages: [
      { type: 'ai', meta: 'Echo · 复盘解释', text: '你这轮的主要薄弱点是冠词和礼貌表达。下一轮我会优先生成“必须自然使用冠词和礼貌请求”的题。' },
      { type: 'ai', meta: 'Echo', text: '右侧辅助追问可以继续解释薄弱点，主学习流仍停留在复盘结果，方便你随时回到下一轮练习。' },
    ],
  },
};

const flowData = {
  onboarding: {
    title: 'onboarding',
    description: 'Echo 用自然对话收集用户画像，系统保存必要字段，并在完成后进入场景选择。',
    system: '保存画像、校验账号入口、创建当前会话。',
    ai: '询问关键信息、总结画像、推荐下一步。',
    widgets: ['account-gate', 'intent-confirm'],
  },
  scene_selecting: {
    title: 'scene_selecting',
    description: '系统确认当前状态允许选择场景，Echo 生成候选场景并展示场景卡片。',
    system: '校验场景选择、写入当前会话上下文。',
    ai: '推荐场景、解释推荐理由、生成练习方向。',
    widgets: ['scene-cards', 'choice-question'],
  },
  practicing: {
    title: 'practicing',
    description: '主线正在出题或等待用户答题。旧会话答案与批改详情默认受限。',
    system: '创建练习记录、控制会话锁定、校验提交。',
    ai: '生成题目、提示和适合当前水平的表达。',
    widgets: ['exercise-card', 'fill-blank', 'choice-question', 'conversation-lock'],
  },
  grading: {
    title: 'grading',
    description: '系统收到正式答案后进入批改状态。主线等待批改完成，辅助追问不改变主线。',
    system: '写入练习记录、保存批改结果和错误标签。',
    ai: '生成评分、错因解释、鼓励语和下一题建议。',
    widgets: ['grading-result', 'follow-up-source'],
  },
  awaiting_next: {
    title: 'awaiting_next',
    description: '批改完成后等待下一步：继续练、类似题、换场景或复盘。',
    system: '校验下一步 action，必要时展示确认。',
    ai: '推荐后续练习方向或解释选择理由。',
    widgets: ['intent-confirm', 'learning-menu'],
  },
  reviewing: {
    title: 'reviewing',
    description: '系统读取结构化记录，Echo 生成自然语言复盘和下一轮建议。',
    system: '读取练习、批改、错误标签索引，恢复历史可见性。',
    ai: '总结强弱项、解释薄弱点、推荐重练方向。',
    widgets: ['progress-summary', 'answer-review'],
  },
  archived: {
    title: 'archived',
    description: '历史会话只读，不再继续答题。如需继续练，系统创建新的学习流并引用摘要。',
    system: '归档会话、保留回放、禁止继续提交答案。',
    ai: '可基于历史摘要推荐新练习。',
    widgets: ['answer-review', 'conversation-lock'],
  },
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  const toastEl = $('#toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
}

function initTheme() {
  const storedTheme = window.localStorage.getItem('echora-theme');
  const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = storedTheme || systemTheme;

  $all('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      window.localStorage.setItem('echora-theme', nextTheme);
      showToast(nextTheme === 'dark' ? '已切换为深色主题' : '已切换为浅色主题');
    });
  });
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function setConnection(kind) {
  const connectionStatus = $('#connectionStatus');
  const connectionText = $('#connectionText');
  if (!connectionStatus || !connectionText) return;
  connectionStatus.classList.remove('is-streaming', 'is-offline', 'is-saved');
  if (kind === 'thinking') {
    connectionStatus.classList.add('is-streaming');
    connectionText.textContent = 'Echo 正在生成';
  } else if (kind === 'offline') {
    connectionStatus.classList.add('is-offline');
    connectionText.textContent = '正在恢复连接';
  } else if (kind === 'saved') {
    connectionStatus.classList.add('is-saved');
    connectionText.textContent = '已保存学习进度';
  } else {
    connectionText.textContent = '准备好了';
  }
}

function setComposerMode(mode) {
  const resolvedMode = mode === 'menu' ? 'chat' : mode;
  $all('[data-composer-mode]').forEach(el => {
    el.classList.toggle('is-active', el.dataset.composerMode === resolvedMode);
  });
  const menuPanel = $('#menuPanel');
  if (menuPanel) menuPanel.classList.toggle('is-visible', mode === 'menu');
}

function badgeList(items, modifier = '') {
  return `<div class="tag-row">${items.map(item => `<span class="badge ${modifier}">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function renderWidget(widget) {
  if (!widget) return '';

  if (widget.type === 'profile-card') {
    return `
      <div class="widget">
        <div class="widget-head">
          <div>
            <h2 class="widget-title">${escapeHtml(widget.title)}</h2>
            <p class="widget-subtitle">这些信息会帮助 Echo 选择更合适的场景和题目。</p>
          </div>
          <span class="badge badge--coral">个性化</span>
        </div>
        ${widget.rows.map(([key, value]) => `
          <div class="compare-box" style="margin-top: 8px;">
            <div class="compare-label">${escapeHtml(key)}</div>
            <div>${escapeHtml(value)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (widget.type === 'scene-cards') {
    return `
      <div class="widget">
        <div class="widget-head">
          <div>
            <h2 class="widget-title">推荐场景</h2>
            <p class="widget-subtitle">点击卡片即可进入练习，也可以继续描述你想练的内容。</p>
          </div>
          <span class="badge badge--coral">可选择</span>
        </div>
        <div class="scene-grid">
          ${widget.scenes.map(scene => `
            <button class="scene-card ${scene.selected ? 'is-selected' : ''}" type="button" data-action-state="practice">
              <div class="scene-icon"><i data-lucide="${escapeHtml(scene.icon)}"></i></div>
              <h3>${escapeHtml(scene.title)}</h3>
              <p>${escapeHtml(scene.desc)}</p>
              ${badgeList(scene.tags)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (widget.type === 'practice-question') {
    return `
      <div class="widget">
        <div class="widget-head">
          <div>
            <h2 class="widget-title">练习题</h2>
            <p class="widget-subtitle">${escapeHtml(widget.stage)}</p>
          </div>
          <span class="badge badge--coral">正在练习</span>
        </div>
        <div class="question-card">
          <p class="question-zh">中文：${escapeHtml(widget.questionZh)}</p>
          <div class="sentence-template">${escapeHtml(widget.template).replace('_____', '<span class="blank">_____</span>')}</div>
          ${badgeList(widget.tags)}
        </div>
      </div>
    `;
  }

  if (widget.type === 'grading-result') {
    return `
      <div class="widget">
        <div class="widget-head">
          <div>
            <h2 class="widget-title">这次批改</h2>
            <p class="widget-subtitle">先肯定表达，再聚焦 1-2 个最值得马上修正的小点。</p>
          </div>
          <span class="badge badge--warning">${escapeHtml(widget.status)}</span>
        </div>
        <div class="grading">
          <div class="grading-score">
            <div class="score-ring">${escapeHtml(widget.score)}</div>
            <div>
              <strong>这次表达基本可理解。</strong>
              <p class="widget-subtitle">继续修正语气和冠词会更自然。</p>
            </div>
          </div>
          <div class="compare-grid">
            <div class="compare-box"><div class="compare-label">你的答案</div><div>${escapeHtml(widget.userAnswer)}</div></div>
            <div class="compare-box"><div class="compare-label">参考表达</div><div>${escapeHtml(widget.referenceAnswer)}</div></div>
          </div>
          ${widget.corrections.map(([from, to, reason]) => `
            <div class="compare-box">
              <div class="compare-label">${escapeHtml(from)} → ${escapeHtml(to)}</div>
              <div>${escapeHtml(reason)}</div>
            </div>
          `).join('')}
          ${badgeList(widget.tags, 'badge--error')}
        </div>
      </div>
    `;
  }

  if (widget.type === 'progress-summary') {
    return `
      <div class="widget">
        <div class="widget-head">
          <div>
            <h2 class="widget-title">学习复盘</h2>
            <p class="widget-subtitle">复盘直接出现在学习流里，不需要跳到单独页面。</p>
          </div>
          <span class="badge badge--coral">已完成</span>
        </div>
        <div class="progress-summary">
          ${widget.stats.map(([value, label]) => `
            <div class="summary-stat">
              <div class="summary-value">${escapeHtml(value)}</div>
              <div class="summary-label">${escapeHtml(label)}</div>
            </div>
          `).join('')}
        </div>
        <div class="compare-grid" style="margin-top: 12px;">
          <div class="compare-box"><div class="compare-label">做得好</div><div>${widget.strengths.map(escapeHtml).join(' · ')}</div></div>
          <div class="compare-box"><div class="compare-label">还需加强</div><div>${widget.weaknesses.map(escapeHtml).join(' · ')}</div></div>
        </div>
        <p class="widget-subtitle" style="margin-top: 12px;">${escapeHtml(widget.suggestion)}</p>
      </div>
    `;
  }

  if (widget.type === 'intent-confirm') {
    return `
      <div class="widget">
        <div class="widget-head">
          <div>
            <h2 class="widget-title">你想继续哪一步？</h2>
            <p class="widget-subtitle">Echo 还不确定你的意思，先给你几个最可能的方向。</p>
          </div>
          <span class="badge badge--warning">需要确认</span>
        </div>
        <div class="intent-grid">
          ${widget.intents.map(([label, desc, state]) => `
            <button class="choice-card" type="button" data-action-state="${escapeHtml(state)}">
              <h3>${escapeHtml(label)}</h3>
              <p>${escapeHtml(desc)}</p>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  return '';
}

function renderProcess(steps) {
  if (!steps || !steps.length) return '';
  return `
    <div class="process-panel">
      <div class="process-panel__head">
        <span>AI 处理过程</span>
        <span class="badge badge--dark">实时更新</span>
      </div>
      <div class="process-steps">
        ${steps.map((step, index) => `
          <div class="process-step ${index === steps.length - 1 ? 'is-current' : ''}">
            <span>${index + 1}</span>
            <p>${escapeHtml(step)}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderActions(actions = []) {
  if (!actions.length) return '';
  return `
    <div class="quick-actions">
      ${actions.map(action => `
        <button class="btn btn--secondary btn--small" type="button"
          ${action.state ? `data-action-state="${escapeHtml(action.state)}"` : ''}
          ${action.followUp ? `data-action-follow-up="${escapeHtml(action.followUp)}"` : ''}
          ${action.mode ? `data-action-mode="${escapeHtml(action.mode)}"` : ''}
          ${action.toast ? `data-action-toast="${escapeHtml(action.toast)}"` : ''}>
          ${escapeHtml(action.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderMessage(message) {
  const className = message.type === 'user'
    ? 'message message--user'
    : message.type === 'system'
      ? 'message message--system'
      : 'message message--ai';
  const role = message.type === 'ai'
    ? `<div class="role"><span class="brand-symbol brand-symbol--tiny"><i data-lucide="sparkles"></i></span><span class="ai-name">Echo</span></div>`
    : message.type === 'user'
      ? `<div class="role" style="justify-content:flex-end;">${escapeHtml(message.label || '你')}</div>`
      : '';
  return `
    <article class="${className}">
      ${role}
      <div class="bubble">
        <p>${escapeHtml(message.text)}</p>
        ${renderWidget(message.widget)}
        ${renderProcess(message.steps)}
        ${renderActions(message.actions)}
      </div>
    </article>
  `;
}

function renderFollowUpMessage(message) {
  const className = message.type === 'user' ? 'branch-message branch-message--user' : 'branch-message branch-message--ai';
  return `
    <div class="${className}">
      <span class="branch-message__meta">${escapeHtml(message.meta || (message.type === 'user' ? '你' : 'Echo'))}</span>
      <div>${escapeHtml(message.text)}</div>
    </div>
  `;
}

function renderFollowUpThread(threadName = 'default', options = {}) {
  const branchSource = $('#branchSource');
  const branchMessages = $('#branchMessages');
  const branchInput = $('#branchInput');
  if (!branchSource || !branchMessages) return;
  const thread = followUpThreads[threadName] || followUpThreads.default;
  branchSource.innerHTML = `
    <span class="badge badge--coral">${escapeHtml(thread.sourceBadge)}</span>
    <p>${escapeHtml(thread.sourceText)}</p>
  `;
  branchMessages.innerHTML = thread.messages.map(renderFollowUpMessage).join('');
  if (branchInput) branchInput.placeholder = thread.placeholder || '继续追问这个上下文...';
  branchMessages.scrollTop = branchMessages.scrollHeight;
  if (!options.silent) showToast(`已打开辅助追问：${thread.sourceBadge.replace('来自：', '')}`);
}

function appendFollowUpMessage(message) {
  const branchMessages = $('#branchMessages');
  if (!branchMessages) return;
  branchMessages.insertAdjacentHTML('beforeend', renderFollowUpMessage(message));
  branchMessages.scrollTop = branchMessages.scrollHeight;
}

function bindDynamicActions(root = document) {
  $all('[data-action-state]', root).forEach(btn => {
    if (btn.dataset.boundActionState === 'true') return;
    btn.dataset.boundActionState = 'true';
    btn.addEventListener('click', () => activateState(btn.dataset.actionState));
  });
  $all('[data-action-follow-up]', root).forEach(btn => {
    if (btn.dataset.boundActionFollowUp === 'true') return;
    btn.dataset.boundActionFollowUp = 'true';
    btn.addEventListener('click', () => renderFollowUpThread(btn.dataset.actionFollowUp));
  });
  $all('[data-action-mode]', root).forEach(btn => {
    if (btn.dataset.boundActionMode === 'true') return;
    btn.dataset.boundActionMode = 'true';
    btn.addEventListener('click', () => {
      setComposerMode(btn.dataset.actionMode);
      const modeBadge = $('#modeBadge');
      if (modeBadge) modeBadge.textContent = btn.dataset.actionMode === 'chat' ? '交互：自然对话' : '交互：选择';
      if (btn.dataset.actionToast) showToast(btn.dataset.actionToast);
      else showToast('底部交互区已调整');
    });
  });
  $all('[data-action-toast]', root).forEach(btn => {
    if (btn.dataset.actionMode) return;
    if (btn.dataset.boundActionToast === 'true') return;
    btn.dataset.boundActionToast = 'true';
    btn.addEventListener('click', () => {
      showToast(btn.dataset.actionToast);
    });
  });
  $all('[data-prototype-toast]', root).forEach(btn => {
    if (btn.dataset.boundPrototypeToast === 'true') return;
    btn.dataset.boundPrototypeToast = 'true';
    btn.addEventListener('click', () => showToast(btn.dataset.prototypeToast));
  });
}

function activateState(stateName, options = {}) {
  const messageList = $('#messageList');
  if (!messageList) return;
  const state = demoStates[stateName] || demoStates.onboarding;
  const sessionTitle = $('#sessionTitle');
  const flowBadge = $('#flowBadge');
  const modeBadge = $('#modeBadge');
  if (sessionTitle) sessionTitle.textContent = state.title;
  if (flowBadge) flowBadge.textContent = state.flow;
  if (modeBadge) modeBadge.textContent = state.mode;
  setConnection(state.status);
  setComposerMode(state.inputMode);
  $all('[data-set-state]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.setState === stateName && btn.classList.contains('btn--tab'));
  });
  messageList.innerHTML = state.messages.map(renderMessage).join('');
  renderFollowUpThread(state.followUp || 'default', { silent: true });
  bindDynamicActions(messageList);
  refreshIcons();
  if (!options.silent) showToast(`已切换：${state.flow.replace('当前：', '')}`);
}

function initDemo() {
  if (!$('#messageList')) return;

  $all('[data-set-state]').forEach(btn => {
    btn.addEventListener('click', () => activateState(btn.dataset.setState));
  });
  $all('[data-open-branch]').forEach(btn => {
    btn.addEventListener('click', () => renderFollowUpThread(btn.dataset.openBranch));
  });
  $all('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.historyLocked === 'true') {
        showToast('这段历史暂不可进入。完成当前练习后可完整复盘。');
        return;
      }
      $all('.conversation-item').forEach(el => el.classList.remove('is-active'));
      item.classList.add('is-active');
      activateState(item.dataset.historyState || 'onboarding', { silent: true });
      showToast(`已打开历史对话：${item.dataset.historyTitle}`);
    });
  });

  const menuBtn = $('#menuBtn');
  const menuPanel = $('#menuPanel');
  if (menuBtn && menuPanel) {
    menuBtn.addEventListener('click', () => menuPanel.classList.toggle('is-visible'));
  }

  $all('[data-menu-state]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (menuPanel) menuPanel.classList.remove('is-visible');
      activateState(btn.dataset.menuState);
    });
  });
  $all('[data-menu-toast]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (menuPanel) menuPanel.classList.remove('is-visible');
      showToast(btn.dataset.menuToast);
      setConnection('saved');
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuPanel) menuPanel.classList.remove('is-visible');
  });

  const closeBranch = $('#closeBranch');
  if (closeBranch) {
    closeBranch.addEventListener('click', () => {
      renderFollowUpThread('default', { silent: true });
      showToast('辅助追问已回到默认说明');
    });
  }

  const sendBranch = $('#sendBranch');
  const branchInput = $('#branchInput');
  if (sendBranch && branchInput) {
    sendBranch.addEventListener('click', () => {
      const value = branchInput.value.trim();
      if (!value) {
        showToast('先输入一个想追问的问题');
        return;
      }
      appendFollowUpMessage({ type: 'user', meta: '你', text: value });
      branchInput.value = '';
      window.setTimeout(() => {
        appendFollowUpMessage({
          type: 'ai',
          meta: 'Echo · 辅助追问',
          text: '我会只围绕这处内容继续解释，并保留主学习流的进度。这个支线可以继续深入，但不会改变中间的练习节奏。',
        });
      }, 260);
    });
    branchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendBranch.click();
      }
    });
  }

  const sendBtn = $('#sendBtn');
  const chatInput = $('#chatInput');
  if (sendBtn && chatInput) {
    sendBtn.addEventListener('click', () => {
      const value = chatInput.value.trim();
      if (value) {
        chatInput.value = '';
        activateState('menu');
        showToast('Echo 需要你确认下一步');
      } else {
        showToast('可以输入一句话，也可以点左侧按钮打开学习菜单');
      }
    });
    chatInput.addEventListener('input', () => {
      if (chatInput.value.trim() && menuPanel) menuPanel.classList.remove('is-visible');
    });
  }

  const submitFill = $('#submitFill');
  if (submitFill) {
    submitFill.addEventListener('click', () => {
      showToast('答案已提交，Echo 正在批改');
      activateState('grade');
    });
  }

  activateState('grade', { silent: true });
}

function initWidgetsPage() {
  const widgetCards = $all('[data-widget-demo]');
  if (!widgetCards.length) return;
  const statuses = ['loading', 'ready', 'disabled', 'submitted', 'expired', 'error'];

  function setWidgetStatus(status) {
    widgetCards.forEach(card => {
      statuses.forEach(item => card.classList.remove(`is-status-${item}`));
      card.classList.add(`is-status-${status}`);
      const label = card.querySelector('.widget-status-label');
      if (label) label.textContent = status;
    });
    $all('[data-widget-status]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.widgetStatus === status);
    });
    showToast(`Widget 状态：${status}`);
  }

  $all('[data-widget-status]').forEach(button => {
    button.addEventListener('click', () => setWidgetStatus(button.dataset.widgetStatus));
  });
}

function initWorkflowsPage() {
  const flowTitle = $('#flowTitle');
  if (!flowTitle) return;
  const flowDescription = $('#flowDescription');
  const flowSystem = $('#flowSystem');
  const flowAi = $('#flowAi');
  const flowWidgets = $('#flowWidgets');

  function setFlow(name) {
    const item = flowData[name] || flowData.onboarding;
    flowTitle.textContent = item.title;
    flowDescription.textContent = item.description;
    flowSystem.textContent = item.system;
    flowAi.textContent = item.ai;
    flowWidgets.innerHTML = item.widgets.map(widget => `<span class="badge">${escapeHtml(widget)}</span>`).join('');
    $all('[data-flow]').forEach(button => button.classList.toggle('is-active', button.dataset.flow === name));
    showToast(`已查看状态：${item.title}`);
  }

  $all('[data-flow]').forEach(button => {
    button.addEventListener('click', () => setFlow(button.dataset.flow));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDemo();
  initWidgetsPage();
  initWorkflowsPage();
  bindDynamicActions();
  refreshIcons();
});
