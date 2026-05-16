/**
 * ChatInput — 底部输入区,根据 chat.inputMode 切换:
 *
 *   - chat 模式:textarea + Enter 发送 → sendMessage(text)
 *   - fill 模式:textarea + Enter 提交 → sendAction({ type: 'submit-answer', ... }),
 *                attemptId 从 activeWidgets 中找最新 exercise-card.data.attemptId
 *   - select 模式:隐藏输入,展示提示「请点击上方场景卡片」(交互由 widget 自己处理)
 *   - menu 模式:留 004,本期降级为 chat
 *
 * streaming 时禁用。
 */

import { useState, type KeyboardEvent } from 'react';
import { useChatStore } from '../../stores/chat.js';
import type { LearningWidgetInstance } from '@shared/skill';
import styles from './index.module.css';

export default function ChatInput(): JSX.Element {
  const [text, setText] = useState('');
  const inputMode = useChatStore((s) => s.inputMode);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const isLoading = useChatStore((s) => s.isLoading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAction = useChatStore((s) => s.sendAction);
  const activeWidgets = useChatStore((s) => s.activeWidgets);

  const disabled = streaming || isLoading || text.trim().length === 0;

  const submit = async (): Promise<void> => {
    if (disabled) return;
    const value = text.trim();
    setText('');
    if (inputMode === 'fill') {
      const attemptId = findLatestAttemptId(activeWidgets);
      if (!attemptId) {
        // 退化:作为普通文本发出
        await sendMessage(value);
        return;
      }
      await sendAction({
        type: 'submit-answer',
        payload: { attemptId, answer: value },
      });
    } else {
      await sendMessage(value);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  // select 模式下隐藏输入,提示用户用 widget 操作
  if (inputMode === 'select') {
    return (
      <footer className={styles.inputFooter}>
        <div className={styles.inputInner}>
          <div className={styles.selectHint}>
            👆 请在上方点击场景卡片选择,或点「换一批」。
          </div>
        </div>
      </footer>
    );
  }

  const placeholder = streaming
    ? 'Echo 正在回复...'
    : inputMode === 'fill'
    ? '输入答案后按 Enter 提交'
    : '直接打字告诉我...';

  return (
    <footer className={styles.inputFooter}>
      <div className={styles.inputInner}>
        <div className={styles.inputShell}>
          <button
            type="button"
            className={styles.menuBtn}
            title="学习菜单(004 实现)"
            disabled
          >
            ☰
          </button>
          <textarea
            className={styles.inputTextarea}
            placeholder={placeholder}
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
        <div className={styles.tip}>
          {inputMode === 'fill'
            ? 'Fill 模式 · Enter 提交'
            : 'Enter 发送 · Shift + Enter 换行'}
        </div>
      </div>
    </footer>
  );
}

/**
 * 从 activeWidgets 找最新一个 exercise-card.data.attemptId。
 */
function findLatestAttemptId(
  widgets: Record<string, LearningWidgetInstance>
): number | null {
  const exercises = Object.values(widgets).filter(
    (w) => w.type === 'exercise-card'
  );
  if (exercises.length === 0) return null;
  const latest = exercises[exercises.length - 1];
  const aid = (latest.data as { attemptId?: number }).attemptId;
  return typeof aid === 'number' ? aid : null;
}
