/* ============================================================
   Echora UI Prototype — shared scripts
   ============================================================ */

// Sidebar/topbar component, injected by data-sidebar attribute on <body>
const NAV_GROUPS = [
  {
    title: '工作流',
    items: [
      { href: 'dashboard.html', icon: 'home', label: '首页 Dashboard' },
      { href: 'practice.html', icon: 'graduation-cap', label: '场景练习' },
    ],
  },
  {
    title: '复盘',
    items: [
      { href: 'review.html', icon: 'line-chart', label: '复盘报告' },
      { href: 'wrong-book.html', icon: 'book-open', label: '错题本' },
      { href: 'weakness.html', icon: 'target', label: '薄弱点分析' },
    ],
  },
  {
    title: '账户',
    items: [
      { href: 'settings.html', icon: 'settings', label: '设置' },
      { href: 'index.html', icon: 'compass', label: '原型导航' },
    ],
  },
];

function renderSidebar() {
  const slot = document.querySelector('[data-sidebar]');
  if (!slot) return;
  const active = slot.dataset.active;
  const html = `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <span class="sidebar__brand-mark">E</span>
        <span>Echora</span>
      </div>
      ${NAV_GROUPS.map(group => `
        <div class="sidebar__group-title">${group.title}</div>
        <nav class="sidebar__nav">
          ${group.items.map(item => `
            <a href="${item.href}" class="sidebar__link ${active === item.href ? 'sidebar__link--active' : ''}">
              <i data-lucide="${item.icon}"></i>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>
      `).join('')}
      <div class="sidebar__footer">
        <div class="sidebar__avatar">A</div>
        <div>
          <div class="sidebar__user-name">Alex</div>
          <div class="sidebar__user-meta">B1 · 420</div>
        </div>
      </div>
    </aside>
  `;
  slot.outerHTML = html;
}

function showToast(message, opts = {}) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('is-visible'), opts.duration || 2400);
}

window.echora = { showToast };

document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  if (window.lucide) window.lucide.createIcons();
});
