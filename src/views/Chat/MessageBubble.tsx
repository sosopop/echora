/**
 * 消息气泡 — AI / user / system 三态样式
 */

import styles from './index.module.css';

interface Props {
  role: 'user' | 'assistant' | 'system';
  text: string;
  streaming?: boolean;
}

export default function MessageBubble({
  role,
  text,
  streaming,
}: Props): JSX.Element | null {
  if (!text && !streaming) return null;
  if (role === 'system') {
    return (
      <div className={styles.msgSystem}>
        <div className={styles.msgSystemBubble}>{text}</div>
      </div>
    );
  }
  const isAi = role === 'assistant';
  const rowCls = isAi ? styles.msgAi : styles.msgUser;
  const bubbleCls = isAi ? styles.bubbleAi : styles.bubbleUser;
  return (
    <div className={rowCls}>
      <div className={bubbleCls}>
        {text}
        {streaming && <span className={styles.cursor} />}
      </div>
    </div>
  );
}
