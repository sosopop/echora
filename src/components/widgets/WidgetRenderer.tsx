/**
 * WidgetRenderer — 根据 widget.type 分发到对应 React 组件
 *
 * 未实现的 widget type 渲染为 fallback JSON dump,保证 stub widget 不让页面崩。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import SceneCards from './SceneCards.js';
import ExerciseCard from './ExerciseCard.js';
import GradingResult from './GradingResult.js';
import ProgressSummary from './ProgressSummary.js';
import AnswerReview from './AnswerReview.js';
import IntentConfirm from './IntentConfirm.js';
import FollowUpSource from './FollowUpSource.js';
import ConversationLock from './ConversationLock.js';
import LearningMenu from './LearningMenu.js';
import AccountGate from './AccountGate.js';
import styles from './widgets.module.css';

type WidgetComponent = (props: {
  widget: LearningWidgetInstance;
  onOpenBranch?: (question?: string) => void;
}) => JSX.Element | null;

const REGISTRY: Record<string, WidgetComponent> = {
  'scene-cards': SceneCards,
  'exercise-card': ExerciseCard,
  'grading-result': GradingResult,
  'progress-summary': ProgressSummary,
  'answer-review': AnswerReview,
  'intent-confirm': IntentConfirm,
  'learning-menu': LearningMenu,
  'account-gate': AccountGate,
  'follow-up-source': FollowUpSource,
  'conversation-lock': ConversationLock,
};

export default function WidgetRenderer({
  widget,
  onOpenBranch,
}: {
  widget: LearningWidgetInstance;
  onOpenBranch?: (question?: string) => void;
}): JSX.Element {
  const C = REGISTRY[widget.type];
  if (C) return <C widget={widget} onOpenBranch={onOpenBranch} />;
  return (
    <div className={styles.fallback}>
      [未实现 widget: {widget.type}]{'\n'}
      {JSON.stringify(widget.data, null, 2)}
    </div>
  );
}
