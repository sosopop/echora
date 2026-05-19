/**
 * GradingResult Widget — 批改结果卡片
 *
 * 数据来源:grade skill widget-ready 落到 data
 *   - category / isCorrect / userAnswer / referenceAnswer / explanation / tags / attemptId
 * 正确或相近答案由后端自动串接下一题,这里不再显示分数和下一题按钮。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import styles from './widgets.module.css';
import { labelForErrorTag } from './tagLabels.js';

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
  onOpenBranch,
}: {
  widget: LearningWidgetInstance;
  onOpenBranch?: (question?: string) => void;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as GradingResultData;
  const category = categoryFromData(data);
  if (widget.status !== 'ready' || !category) {
    return null;
  }
  const band = bandFor(category);
  const bandLabel = labelFor(category);
  const followUpSuggestions =
    onOpenBranch && category === 'incorrect'
      ? buildFollowUpSuggestions(data)
      : [];

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
              <span key={t} className={styles.gradingTag} title={t}>
                {labelForErrorTag(t)}
              </span>
            ))}
          </div>
        )}
        {followUpSuggestions.length > 0 && (
          <div className={styles.gradingFollowUps}>
            {followUpSuggestions.map((question) => (
              <button
                key={question}
                type="button"
                className={styles.gradingFollowUpButton}
                onClick={() => onOpenBranch?.(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}
        {(category === 'incorrect' || onOpenBranch) && (
          <div className={styles.gradingActions}>
            {category === 'incorrect' && (
              <div className={styles.gradingRetryHint}>
                可以在底部改一句再提交。
              </div>
            )}
            {onOpenBranch && (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => onOpenBranch()}
              >
                追问
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const TAG_FOLLOW_UPS: Record<string, string> = {
  spelling: '这个拼写错在哪里？',
  word_order: '这句话的语序应该怎么排？',
  tense: '这里时态应该怎么判断？',
  preposition: '这里介词应该怎么选？',
  article: '为什么这里需要冠词？',
  subject_verb_agreement: '这里主谓一致怎么看？',
  auxiliary_verb: '这里为什么需要助动词？',
  collocation: '为什么这里是固定搭配问题？',
  politeness: '怎样说会更礼貌自然？',
  literal_translation: '这句怎样避免直译？',
  missing_word: '我这句少了哪个成分？',
  extra_word: '哪个词是多余的？',
};

function buildFollowUpSuggestions(data: GradingResultData): string[] {
  const suggestions: string[] = [];
  for (const tag of data.tags ?? []) {
    const question = TAG_FOLLOW_UPS[tag];
    if (question) suggestions.push(question);
  }
  if (data.userAnswer && data.referenceAnswer) {
    suggestions.push(
      `为什么「${truncateText(data.userAnswer, 20)}」不如参考表达自然？`
    );
  }
  if (data.explanation) {
    suggestions.push('这次最该记住的规则是什么？');
  }
  suggestions.push('能不能用更简单的话解释？');
  return [...new Set(suggestions)].slice(0, 3);
}

function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
