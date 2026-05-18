/**
 * FollowUpSource Widget — 辅助追问的来源提示。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import styles from './widgets.module.css';

interface FollowUpSourceData {
  sourceKind?: 'grading' | 'exercise' | 'message' | 'chain';
  sourceLabel?: string;
  snippet?: string;
  canMarkForReview?: boolean;
  reviewContext?: {
    attemptId: number;
    gradingId: number;
    tags: string[];
  };
  chainSteps?: Array<{ index: number; text: string }>;
}

export default function FollowUpSource({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as FollowUpSourceData;
  if (
    widget.status !== 'ready' ||
    !data.sourceLabel?.trim() ||
    !data.snippet?.trim()
  ) {
    return null;
  }

  return (
    <section className={styles.followSource} aria-label={data.sourceLabel}>
      <div className={styles.followSourceLabel}>{data.sourceLabel}</div>
      <div className={styles.followSourceSnippet}>{data.snippet}</div>
      {data.chainSteps && data.chainSteps.length > 0 && (
        <ol className={styles.followSourceChain}>
          {data.chainSteps.map((step) => (
            <li key={`${step.index}-${step.text}`}>
              <span className={styles.followSourceStep}>{step.index}</span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.followSourceFoot}>
        {data.sourceKind === 'exercise'
          ? '答题前只给提示,不显示标准答案'
          : data.canMarkForReview
          ? '不改变主学习流'
          : '仅作为上下文提示'}
      </div>
    </section>
  );
}
