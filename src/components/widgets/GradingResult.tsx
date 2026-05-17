/**
 * GradingResult Widget — 批改结果卡片
 *
 * 数据来源:grade skill widget-ready 落到 data
 *   - category / isCorrect / userAnswer / referenceAnswer / explanation / tags / attemptId
 * 正确或相近答案由后端自动串接下一题,这里不再显示分数和下一题按钮。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import styles from './widgets.module.css';

type GradingCategory = 'exact' | 'similar' | 'incorrect';

interface GradingResultData {
  attemptId?: number;
  score?: number;
  isCorrect?: boolean;
  category?: GradingCategory;
  userAnswer?: string;
  referenceAnswer?: string;
  explanation?: string;
  tags?: string[];
}

function categoryFromData(data: GradingResultData): GradingCategory | null {
  if (
    data.category === 'exact' ||
    data.category === 'similar' ||
    data.category === 'incorrect'
  ) {
    return data.category;
  }
  if (typeof data.isCorrect !== 'boolean') return null;
  return data.isCorrect
    ? (data.score ?? 0) >= 95
      ? 'exact'
      : 'similar'
    : 'incorrect';
}

function bandFor(category: GradingCategory): 'correct' | 'warn' | 'wrong' {
  return category === 'exact'
    ? 'correct'
    : category === 'similar'
    ? 'warn'
    : 'wrong';
}

function labelFor(category: GradingCategory): string {
  switch (category) {
    case 'exact':
      return '完全正确';
    case 'similar':
      return '还不错';
    case 'incorrect':
      return '错误';
  }
}

function descFor(category: GradingCategory): string {
  switch (category) {
    case 'exact':
      return '和参考表达完全匹配,已自动继续练习。';
    case 'similar':
      return '意思相近,表达可以接受,已自动继续练习。';
    case 'incorrect':
      return '语法、拼写或意思还不一致,可以在底部改一句再提交。';
  }
}

export default function GradingResult({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as GradingResultData;
  const category = categoryFromData(data);
  if (widget.status !== 'ready' || !category) {
    return null;
  }
  const band = bandFor(category);
  const bandLabel = labelFor(category);

  return (
    <div className={styles.gradingCard}>
      <div className={`${styles.gradingBar} ${styles[band]}`} />
      <div className={styles.gradingBody}>
        <div className={styles.gradingStatusRow}>
          <span className={`${styles.gradingBadge} ${styles[band]}`}>
            {bandLabel}
          </span>
          <span className={styles.gradingStatusDesc}>{descFor(category)}</span>
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
        {category === 'incorrect' && (
          <div className={styles.gradingRetryHint}>
            可以在底部改一句再提交。
          </div>
        )}
      </div>
    </div>
  );
}
