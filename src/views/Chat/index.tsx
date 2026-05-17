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

import { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chat.js';
import { useLearningStateStore } from '../../stores/learningState.js';
import { useAuthStore } from '../../stores/auth.js';
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

export default function Chat(): JSX.Element {
  const learningState = useLearningStateStore((s) => s.state);
  const error = useChatStore((s) => s.error);
  const conversations = useChatStore((s) => s.conversations);
  const currentId = useChatStore((s) => s.currentConversationId);
  const isBranchOpen = useChatStore((s) => s.isBranchOpen);
  const user = useAuthStore((s) => s.user);
  const initRef = useRef(false);

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
        <span className={styles.avatar} title={user?.email ?? ''}>
          {user?.email?.[0]?.toUpperCase() ?? '?'}
        </span>
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

      <ChatInput />
    </div>
  );
}
