/**
 * 消息气泡 — AI / user / system 三态样式
 */

import styles from './index.module.css';
import { describeChatAction, type ChatAction } from '@shared/api';

interface Props {
  role: 'user' | 'assistant' | 'system';
  text: string;
  streaming?: boolean;
  referenced?: boolean;
}

export default function MessageBubble({
  role,
  text,
  streaming,
  referenced,
}: Props): JSX.Element | null {
  const isAi = role === 'assistant';
  const displayText =
    role === 'user'
      ? normalizeUserText(text)
      : text || (isAi && streaming ? 'Echo 正在思考中...' : '');
  if (!displayText && !streaming) return null;
  if (role === 'system') {
    return (
      <div className={styles.msgSystem}>
        <div className={styles.msgSystemBubble}>{displayText}</div>
      </div>
    );
  }
  const rowCls = isAi ? styles.msgAi : styles.msgUser;
  const bubbleCls = [
    isAi ? styles.bubbleAi : styles.bubbleUser,
    referenced ? styles.bubbleReferenced : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={rowCls}>
      <div className={bubbleCls}>
        {displayText}
        {streaming && <span className={styles.cursor} />}
      </div>
    </div>
  );
}

function normalizeUserText(text: string): string {
  const match = text.match(/^\[action\]\s*(\{.*\})$/s);
  if (!match) return text;
  try {
    return describeChatAction(JSON.parse(match[1]) as ChatAction);
  } catch {
    return text;
  }
}
