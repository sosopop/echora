/**
 * ConversationLock Widget — 练习/批改中隐藏历史答案与批改详情。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import styles from './widgets.module.css';

interface ConversationLockData {
  variant?: 'practicing' | 'grading' | 'archived' | 'unlocked';
  title?: string;
  description?: string;
}

export default function ConversationLock({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as ConversationLockData;
  if (
    widget.status !== 'ready' ||
    !data.title?.trim() ||
    !data.description?.trim()
  ) {
    return null;
  }

  return (
    <section
      className={`${styles.conversationLock} ${
        data.variant === 'archived' ? styles.archived : ''
      }`}
      aria-label={data.title}
    >
      <div className={styles.conversationLockMark} aria-hidden="true">
        {data.variant === 'archived' ? '档' : '锁'}
      </div>
      <div className={styles.conversationLockText}>
        <h3 className={styles.conversationLockTitle}>{data.title}</h3>
        <p className={styles.conversationLockDesc}>{data.description}</p>
      </div>
    </section>
  );
}
