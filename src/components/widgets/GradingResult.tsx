/**
 * GradingResult Widget — 批改结果卡片
 *
 * 数据来源:grade skill widget-ready 落到 data
 *   - score / isCorrect / userAnswer / referenceAnswer / explanation / tags / attemptId
 * 交互:底部「下一题」按钮 → sendAction({ type: 'next-question' })
 */

import type { LearningWidgetInstance } from '@shared/skill';
import { useChatStore } from '../../stores/chat.js';
import styles from './widgets.module.css';

interface GradingResultData {
  attemptId?: number;
  score?: number;
  isCorrect?: boolean;
  userAnswer?: string;
  referenceAnswer?: string;
  explanation?: string;
  tags?: string[];
}

function bandFor(score: number, isCorrect: boolean): 'correct' | 'warn' | 'wrong' {
  if (isCorrect || score >= 80) return 'correct';
  if (score >= 60) return 'warn';
  return 'wrong';
}

function labelFor(band: 'correct' | 'warn' | 'wrong'): string {
  return band === 'correct' ? '通过' : band === 'warn' ? '部分对' : '未通过';
}

export default function GradingResult({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const sendAction = useChatStore((s) => s.sendAction);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const data = (widget.data ?? {}) as GradingResultData;
  if (
    widget.status !== 'ready' ||
    typeof data.score !== 'number' ||
    typeof data.isCorrect !== 'boolean'
  ) {
    return null;
  }
  const score = data.score;
  const band = bandFor(score, data.isCorrect);
  const bandLabel = labelFor(band);

  return (
    <div className={styles.gradingCard}>
      <div className={`${styles.gradingBar} ${styles[band]}`} />
      <div className={styles.gradingBody}>
        <div className={styles.gradingScoreRow}>
          <span className={styles.gradingScore}>{score}</span>
          <span className={`${styles.gradingBadge} ${styles[band]}`}>
            {bandLabel}
          </span>
        </div>
        <div className={styles.gradingCompare}>
          <div className={styles.gradingAnswerBlock}>
            <div className={styles.gradingAnswerLabel}>你的回答</div>
            <div className={styles.gradingAnswerText}>
              {data.userAnswer ?? '(空)'}
            </div>
          </div>
          {data.referenceAnswer && (
            <div className={styles.gradingAnswerBlock}>
              <div className={styles.gradingAnswerLabel}>参考表达</div>
              <div className={styles.gradingAnswerText}>
                {data.referenceAnswer}
              </div>
            </div>
          )}
        </div>
        {data.explanation && (
          <div className={styles.gradingExplain}>{data.explanation}</div>
        )}
        {data.tags && data.tags.length > 0 && (
          <div className={styles.gradingTags}>
            {data.tags.map((t) => (
              <span key={t} className={styles.gradingTag}>
                {t}
              </span>
            ))}
          </div>
        )}
        <div className={styles.gradingActions}>
          {!data.isCorrect && (
            <span className={styles.gradingRetryHint}>
              可以在底部改一句再提交
            </span>
          )}
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={streaming}
            onClick={() => void sendAction({ type: 'next-question' })}
          >
            {data.isCorrect ? '下一题 →' : '跳过到下一题 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
