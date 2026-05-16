/**
 * 对话流:渲染会话历史 + 当前 streaming 消息
 *
 * 数据来源:
 *   - chat.messages[]:已落库消息(content 已累积)
 *   - chat.streamBuffer[messageId]:当前正在 stream 的增量
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chat.js';
import styles from './index.module.css';

export default function ChatStream(): JSX.Element {
  const messages = useChatStore((s) => s.messages);
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamBuffer]);

  return (
    <div>
      {messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
          const isAi = m.role === 'assistant';
          const isStreaming = streamingId === m.id;
          // streaming 时优先用 buffer,否则用已落库的 content
          const text = isStreaming
            ? streamBuffer[m.id] ?? m.content ?? ''
            : m.content ?? '';
          const cls = isAi
            ? `${styles.message} ${styles.messageAi}`
            : `${styles.message} ${styles.messageUser}`;
          const bubbleCls = isAi
            ? `${styles.bubble} ${styles.bubbleAi}`
            : `${styles.bubble} ${styles.bubbleUser}`;
          return (
            <div key={m.id} className={cls}>
              <div className={bubbleCls}>
                {text}
                {isStreaming && <span className={styles.cursor} />}
              </div>
            </div>
          );
        })}
      <div ref={endRef} />
    </div>
  );
}
