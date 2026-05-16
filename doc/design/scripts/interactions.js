/* Echora 原型轻交互
 *
 * 主题:
 *   - 自动跟随 (prefers-color-scheme: dark) via tokens.css
 *   - 用户手动切换写入 localStorage.echora-theme = "light" | "dark"
 *   - 自动注入切换按钮到 .top-nav (无 .top-nav 时浮动右上角)
 *
 * 通用:
 *   - data-tab + data-tab-group + data-tab-panel: 选项卡
 *   - data-toggle="#id":   切换 .open class
 *   - data-menu-toggle="#id": 弹出 popover, 点击外部自动关闭
 *   - data-close="#id":    移除 .open class
 *   - data-theme-toggle:   切换主题
 */

(function () {
  var STORAGE_KEY = 'echora-theme';

  // —— 1. 早期主题应用 (尽量减少 FOUT) ——————————————————————
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    // ignore (无 localStorage 时退化到 prefers-color-scheme)
  }

  function currentTheme() {
    var explicit = document.documentElement.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
    syncToggleVisuals();
  }

  function syncToggleVisuals() {
    var isDark = currentTheme() === 'dark';
    var iconLight = '🌙';   // 当前明色, 点击切到暗色
    var iconDark = '☀';    // 当前暗色, 点击切到明色
    document
      .querySelectorAll('[data-theme-toggle]')
      .forEach(function (btn) {
        var ic = btn.querySelector('.theme-icon');
        if (ic) ic.textContent = isDark ? iconDark : iconLight;
        btn.setAttribute(
          'title',
          isDark ? '切换到明色模式' : '切换到暗色模式'
        );
        btn.setAttribute(
          'aria-label',
          isDark ? '切换到明色模式' : '切换到暗色模式'
        );
      });
  }

  function createToggleButton() {
    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.setAttribute('data-theme-toggle', '');
    var span = document.createElement('span');
    span.className = 'theme-icon';
    span.textContent = '🌙';
    btn.appendChild(span);
    return btn;
  }

  function injectToggle() {
    var navs = document.querySelectorAll('.top-nav');
    if (navs.length > 0) {
      navs.forEach(function (nav) {
        if (nav.querySelector('[data-theme-toggle]')) return;
        var btn = createToggleButton();
        var avatar = nav.querySelector('.avatar');
        if (avatar) {
          nav.insertBefore(btn, avatar);
        } else {
          nav.appendChild(btn);
        }
      });
    } else {
      // 浮动挂载
      if (!document.querySelector('.theme-toggle-float')) {
        var float = createToggleButton();
        float.classList.add('theme-toggle-float');
        document.body.appendChild(float);
      }
    }
    syncToggleVisuals();
  }

  // 监听系统偏好变化 (无显式 data-theme 时同步图标)
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function () {
      if (!document.documentElement.hasAttribute('data-theme')) {
        syncToggleVisuals();
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else {
    injectToggle();
  }

  // —— 2. 通用事件分发 ————————————————————————————————————————
  function closest(el, selector) {
    return el && el.closest ? el.closest(selector) : null;
  }

  document.addEventListener('click', function (e) {
    // —— 主题切换 ————————————————————————————————————————
    var themeBtn = closest(e.target, '[data-theme-toggle]');
    if (themeBtn) {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      e.stopPropagation();
      return;
    }

    // —— Tab 切换 ————————————————————————————————————————
    var tab = closest(e.target, '[data-tab]');
    if (tab) {
      var group = tab.closest('[data-tab-group]');
      if (group) {
        var key = tab.getAttribute('data-tab');
        group.querySelectorAll('[data-tab]').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        group
          .querySelectorAll('[data-tab-panel]')
          .forEach(function (p) {
            p.classList.toggle(
              'active',
              p.getAttribute('data-tab-panel') === key
            );
          });
      }
    }

    // —— Toggle (drawer / branch panel / etc.) ————————————
    var toggle = closest(e.target, '[data-toggle]');
    if (toggle) {
      var sel = toggle.getAttribute('data-toggle');
      var target = document.querySelector(sel);
      if (target) target.classList.toggle('open');
    }

    // —— Close button ——————————————————————————————————————
    var closeBtn = closest(e.target, '[data-close]');
    if (closeBtn) {
      var sel2 = closeBtn.getAttribute('data-close');
      var target2 = document.querySelector(sel2);
      if (target2) target2.classList.remove('open');
    }

    // —— Popover ———————————————————————————————————————————
    var menuToggle = closest(e.target, '[data-menu-toggle]');
    if (menuToggle) {
      var sel3 = menuToggle.getAttribute('data-menu-toggle');
      var pop = document.querySelector(sel3);
      if (pop) {
        var willOpen = !pop.classList.contains('open');
        document.querySelectorAll('.popover.open').forEach(function (p) {
          p.classList.remove('open');
        });
        pop.classList.toggle('open', willOpen);
      }
      e.stopPropagation();
      return;
    }

    // 点击外部关闭 popover
    if (!closest(e.target, '.popover')) {
      document.querySelectorAll('.popover.open').forEach(function (p) {
        p.classList.remove('open');
      });
    }
  });

  // Esc 关闭所有展开层
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document
        .querySelectorAll('.popover.open, .drawer.open, .branch-panel.open')
        .forEach(function (el) {
          el.classList.remove('open');
        });
    }
  });
})();
