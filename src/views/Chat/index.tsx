/**
 * Chat 视图首版(003 MVP)
 *
 * 仅中栏主流(左栏历史 / 右栏支线留 004)。
 * mount 时:
 *   - loadConversations
 *   - 若已有 onboarding/scene_selecting/practicing 会话 → 选中
 *   - 若无会话 → 不主动建(RouteGuard 会兜底跳 /onboarding)
 *
 * 子组件:ProgressBanner / MessageList / ChatInput
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../stores/chat.js';
import { useLearningStateStore } from '../../stores/learningState.js';
import { useAuthStore } from '../../stores/auth.js';
import { useThemeStore, type ThemeMode } from '../../stores/theme.js';
import MessageList from './MessageList.js';
import ChatInput from './ChatInput.js';
import BranchPanel from './BranchPanel.js';
import HistoryPanel from './HistoryPanel.js';
import styles from './index.module.css';

const LEARNING_STATE_LABEL: Record<string, string> = {
  onboarding: '画像采集',
  scene_selecting: '选择场景',
  practicing: '练习中',
  grading: '批改中',
  awaiting_next: '待继续',
  reviewing: '复盘中',
  archived: '已归档',
};

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'light', label: '亮色', hint: 'Light' },
  { value: 'dark', label: '暗色', hint: 'Dark' },
  { value: 'system', label: '系统', hint: 'Auto' },
];

export default function Chat(): JSX.Element {
  const learningState = useLearningStateStore((s) => s.state);
  const error = useChatStore((s) => s.error);
  const conversations = useChatStore((s) => s.conversations);
  const currentId = useChatStore((s) => s.currentConversationId);
  const isBranchOpen = useChatStore((s) => s.isBranchOpen);
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const initRef = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void (async () => {
      const store = useChatStore.getState();
      await store.loadConversations();
      const list = useChatStore.getState().conversations;
      // 优先选 practicing > scene_selecting > 第一个
      const candidate =
        list.find((c) => c.learningState === 'practicing') ??
        list.find((c) => c.learningState === 'scene_selecting') ??
        list[0];
      if (candidate) {
        await useChatStore.getState().selectConversation(candidate.id);
      }
    })();
  }, []);

  return (
    <div
      className={[
        styles.shell,
        isBranchOpen ? styles.shellWithBranch : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className={styles.topBar}>
        <button
          className={styles.historyToggle}
          type="button"
          aria-label="打开历史会话"
          onClick={() => setHistoryOpen(true)}
        >
          ☰
        </button>
        <span className={styles.brand}>
          <span className={styles.brandMark}>✱</span> Echora
        </span>
        <span className={styles.sessionInfo}>
          {currentId ? `会话 #${currentId}` : '尚未选择会话'}
        </span>
        <span className={styles.spacer} />
        <span className={styles.stateBadge}>
          {LEARNING_STATE_LABEL[learningState] ?? learningState}
        </span>
        <div className={styles.accountMenu} ref={menuRef}>
          <button
            type="button"
            className={styles.avatarButton}
            aria-label="打开账号菜单"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </button>
          {menuOpen && (
            <div className={styles.accountPopover}>
              <div className={styles.accountSummary}>
                <span className={styles.accountAvatar}>
                  {user?.email?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className={styles.accountText}>
                  <span className={styles.accountLabel}>当前账号</span>
                  <span className={styles.accountEmail}>{user?.email ?? ''}</span>
                </span>
              </div>
              <div className={styles.menuSectionLabel}>外观</div>
              <div className={styles.themeSegment} role="group" aria-label="主题">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={[
                      styles.themeOption,
                      theme === option.value ? styles.themeOptionActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={theme === option.value}
                    onClick={() => setTheme(option.value)}
                  >
                    <span>{option.label}</span>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>
              <div className={styles.menuDivider} />
              <button
                type="button"
                className={styles.logoutButton}
                onClick={handleLogout}
              >
                <span>退出登录</span>
                <span>清除本机登录状态</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={styles.workspace}>
        <HistoryPanel />
        <main className={styles.main}>
          {error && <div className={styles.errorBar}>{error}</div>}
          {conversations.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>暂无会话</div>
              <div className={styles.emptyDesc}>
                完成 onboarding 后,Echo 会自动为你推荐场景。
              </div>
            </div>
          ) : (
            <MessageList />
          )}
        </main>
        <BranchPanel />
      </div>

      {historyOpen && (
        <div className={styles.mobileHistoryOverlay}>
          <button
            className={styles.mobileHistoryBackdrop}
            type="button"
            aria-label="关闭历史会话"
            onClick={() => setHistoryOpen(false)}
          />
          <HistoryPanel
            variant="drawer"
            onClose={() => setHistoryOpen(false)}
          />
        </div>
      )}

      <ChatInput />
    </div>
  );
}
