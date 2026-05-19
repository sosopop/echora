/**
 * AnswerReview Widget — 单题回看列表
 */

import type { LearningWidgetInstance } from '@shared/skill';
import styles from './widgets.module.css';
import { labelForErrorTag } from './tagLabels.js';

interface AnswerReviewItem {
  questionNo: number;
  promptShort: string;
  questionType: string;
  score: number;
  status: 'ok' | 'warn' | 'bad';
  tags?: string[];
}

interface AnswerReviewData {
  title?: string;
  items?: AnswerReviewItem[];
}

function labelForQuestionType(questionType: string): string {
  switch (questionType) {
    case 'fill_word':
      return '单词填空';
    case 'sentence_translation':
      return '整句翻译';
    case 'dialogue_chain':
      return '对话接龙';
    case 'role_reversal':
      return '角色互换';
    default:
      return '练习题';
  }
}

function scoreLabel(item: AnswerReviewItem): string {
  return item.status === 'ok' ? `✓ ${item.score}` : String(item.score);
}

export default function AnswerReview({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as AnswerReviewData;
  const items = Array.isArray(data.items) ? data.items : [];
  if (widget.status !== 'ready' || items.length === 0) {
    return null;
  }

  const avg = Math.round(
    items.reduce((sum, item) => sum + item.score, 0) / items.length
  );
  const highCount = items.filter((item) => item.score >= 90).length;

  return (
    <section className={styles.answerReviewCard} aria-label="单题回看">
      <header className={styles.answerReviewHead}>
        <h3 className={styles.answerReviewTitle}>
          {data.title ?? `${items.length} 道题回看`}
        </h3>
        <span className={styles.answerReviewHint}>逐题速览</span>
      </header>
      <div className={styles.answerReviewList}>
        {items.map((item) => (
          <article key={item.questionNo} className={styles.answerReviewRow}>
            <div className={styles.answerReviewNo}>Q{item.questionNo}</div>
            <div className={styles.answerReviewContent}>
              <div className={styles.answerReviewPrompt}>
                {item.promptShort}
              </div>
              <div className={styles.answerReviewMeta}>
                <span
                  className={`${styles.answerReviewScore} ${
                    styles[item.status]
                  }`}
                >
                  {scoreLabel(item)}
                </span>
                <span>{labelForQuestionType(item.questionType)}</span>
                {(item.tags ?? []).map((tag) => (
                  <span key={tag} title={tag}>
                    {labelForErrorTag(tag)}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <footer className={styles.answerReviewFoot}>
        {items.length} 题平均 {avg} 分 · {highCount} 题 ≥ 90 分
      </footer>
    </section>
  );
}
