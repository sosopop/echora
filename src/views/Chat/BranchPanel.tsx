import { useState } from 'react';
import type { MessageDTO } from '@shared/api';
import { useChatStore } from '../../stores/chat.js';
import styles from './index.module.css';

export default function BranchPanel(): JSX.Element | null {
  const isOpen = useChatStore((s) => s.isBranchOpen);
  const isLoading = useChatStore((s) => s.isBranchLoading);
  const error = useChatStore((s) => s.branchError);
  const sourceMessageId = useChatStore((s) => s.branchSourceMessageId);
  const mainMessages = useChatStore((s) => s.messages);
  const branchMessages = useChatStore((s) => s.branchMessages);
  const isBranchReviewing = useChatStore((s) => s.isBranchReviewing);
  const branchReviewMessage = useChatStore((s) => s.branchReviewMessage);
  const closeBranch = useChatStore((s) => s.closeBranch);
  const sendBranchMessage = useChatStore((s) => s.sendBranchMessage);
  const markBranchForReview = useChatStore((s) => s.markBranchForReview);
  const [draft, setDraft] = useState('');

  if (!isOpen) return null;

  const source = mainMessages.find((m) => m.id === sourceMessageId);
  const sourceText = source?.content?.trim()
    ? truncateText(source.content.trim(), 96)
    : source
    ? `第 ${source.seq} 条消息`
    : '当前消息';
  const canJoinReview = canJoinSourceReview(source);

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || isLoading) return;
    setDraft('');
    await sendBranchMessage(text);
  }

  return (
    <aside className={styles.branchPanel} aria-label="辅助追问">
      <div className={styles.branchHead}>
        <span className={styles.branchBadge}>支线</span>
        <span className={styles.branchTitle}>辅助追问</span>
        <button
          className={styles.branchClose}
          type="button"
          aria-label="关闭辅助追问"
          onClick={closeBranch}
        >
          ×
        </button>
      </div>

      <div className={styles.branchSource}>
        <div className={styles.branchSourceLabel}>来自主线</div>
        <div>{sourceText}</div>
        {canJoinReview && (
          <button
            className={styles.branchReviewButton}
            type="button"
            disabled={isBranchReviewing || isLoading}
            onClick={() => void markBranchForReview()}
          >
            {isBranchReviewing ? '加入中...' : '加入复盘'}
          </button>
        )}
        {branchReviewMessage && (
          <div className={styles.branchReviewNote}>{branchReviewMessage}</div>
        )}
      </div>

      <div className={styles.branchScroll}>
        {branchMessages.length === 0 && !isLoading ? (
          <div className={styles.branchEmpty}>选中主线内容后,可以在这里继续追问。</div>
        ) : (
          branchMessages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === 'user'
                  ? styles.branchMsgUser
                  : styles.branchMsgAi
              }
            >
              {msg.content}
            </div>
          ))
        )}
        {isLoading && (
          <div className={styles.branchMsgAi}>Echo 正在整理支线回复...</div>
        )}
        {error && <div className={styles.branchError}>{error}</div>}
      </div>

      <div className={styles.branchComposer}>
        <div className={styles.branchInputShell}>
          <textarea
            value={draft}
            placeholder="继续追问..."
            rows={1}
            disabled={isLoading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button
            className={styles.branchSend}
            type="button"
            disabled={!draft.trim() || isLoading}
            onClick={() => void submit()}
          >
            ↑
          </button>
        </div>
        <div className={styles.branchTip}>支线不影响主线进度</div>
      </div>
    </aside>
  );
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

function canJoinSourceReview(source?: MessageDTO): boolean {
  if (!source) return false;
  return widgetSnapshotToArray(source.widgetSnapshot).some((widget) => {
    const data = widget.data;
    if (widget.type === 'grading-result') {
      const tags = data?.tags;
      return (
        typeof data?.attemptId === 'number' &&
        Array.isArray(tags) &&
        tags.length > 0
      );
    }
    if (widget.type === 'follow-up-source') {
      const context = data?.reviewContext;
      const tags =
        typeof context === 'object' && context !== null
          ? (context as { tags?: unknown }).tags
          : null;
      return (
        typeof context === 'object' &&
        context !== null &&
        typeof (context as { attemptId?: unknown }).attemptId === 'number' &&
        Array.isArray(tags) &&
        tags.length > 0
      );
    }
    return false;
  });
}

function widgetSnapshotToArray(
  snapshot: unknown
): Array<{ type?: string; data?: Record<string, unknown> }> {
  if (Array.isArray(snapshot)) {
    return snapshot.filter(isWidgetLike);
  }
  return isWidgetLike(snapshot) ? [snapshot] : [];
}

function isWidgetLike(
  value: unknown
): value is { type?: string; data?: Record<string, unknown> } {
  return typeof value === 'object' && value !== null;
}
