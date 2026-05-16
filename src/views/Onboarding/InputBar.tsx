/**
 * 底部输入区
 *
 * Enter 发送,Shift+Enter 换行;streaming 时禁用。
 */

import { useState, type KeyboardEvent } from 'react';
import { useChatStore } from '../../stores/chat.js';
import styles from './index.module.css';

export default function InputBar(): JSX.Element {
  const [text, setText] = useState('');
  const sendMessage = useChatStore((s) => s.sendMessage);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const isLoading = useChatStore((s) => s.isLoading);

  const disabled = streaming || isLoading || text.trim().length === 0;

  const submit = async (): Promise<void> => {
    if (disabled) return;
    const value = text.trim();
    setText('');
    await sendMessage(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <footer className={styles.inputFooter}>
      <div className={styles.inputInner}>
        <div className={styles.inputShell}>
          <button
            type="button"
            className={styles.menuBtn}
            title="学习菜单"
            disabled
          >
            ☰
          </button>
          <textarea
            className={styles.inputTextarea}
            placeholder={
              streaming ? 'Echo 正在回复...' : '直接打字告诉我...'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={streaming}
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={disabled}
            onClick={() => void submit()}
          >
            发送 →
          </button>
        </div>
        <div className={styles.tip}>Enter 发送 · Shift + Enter 换行</div>
      </div>
    </footer>
  );
}
