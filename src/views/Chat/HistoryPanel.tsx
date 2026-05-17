import { useChatStore } from '../../stores/chat.js';
import type { ConversationDTO } from '@shared/api';
import styles from './index.module.css';

const STATE_LABELS: Record<string, string> = {
  onboarding: '画像',
  scene_selecting: '选场景',
  practicing: '练习',
  grading: '批改',
  awaiting_next: '待继续',
  reviewing: '复盘',
  archived: '归档',
};

interface Props {
  variant?: 'sidebar' | 'drawer';
  onClose?: () => void;
}

export default function HistoryPanel({
  variant = 'sidebar',
  onClose,
}: Props): JSX.Element {
  const conversations = useChatStore((s) => s.conversations);
  const currentId = useChatStore((s) => s.currentConversationId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const startNewConversation = useChatStore((s) => s.startNewConversation);

  return (
    <aside
      className={[
        styles.historyPanel,
        variant === 'drawer' ? styles.historyDrawerPanel : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="历史会话"
    >
      <div className={styles.historyHead}>
        <div className={styles.historyTitle}>历史会话</div>
        <div className={styles.historyCount}>{conversations.length}</div>
        {variant === 'drawer' && (
          <button
            className={styles.historyClose}
            type="button"
            aria-label="关闭历史会话"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <button
        className={styles.historyNewBtn}
        type="button"
        onClick={() => {
          void startNewConversation();
          onClose?.();
        }}
      >
        ＋ 新建对话
      </button>
      <div className={styles.historyList}>
        {conversations.length === 0 ? (
          <div className={styles.historyEmpty}>暂无历史</div>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={[
                styles.historyItem,
                currentId === conversation.id ? styles.historyItemActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              type="button"
              onClick={() => {
                if (conversation.id !== currentId) {
                  void selectConversation(conversation.id);
                  onClose?.();
                }
              }}
            >
              <span className={styles.historyItemTitle}>
                {conversationTitle(conversation)}
              </span>
              <span className={styles.historyItemMeta}>
                {STATE_LABELS[conversation.learningState] ??
                  conversation.learningState}
                {conversation.status === 'archived' ? ' · 已归档' : ''}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function conversationTitle(conversation: ConversationDTO): string {
  return conversation.title?.trim() || `会话 #${conversation.id}`;
}
