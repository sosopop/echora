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
import styles from './widgets.module.css';

type WidgetComponent = (props: {
  widget: LearningWidgetInstance;
}) => JSX.Element | null;

const REGISTRY: Record<string, WidgetComponent> = {
  'scene-cards': SceneCards,
  'exercise-card': ExerciseCard,
  'grading-result': GradingResult,
  'progress-summary': ProgressSummary,
};

export default function WidgetRenderer({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element {
  const C = REGISTRY[widget.type];
  if (C) return <C widget={widget} />;
  return (
    <div className={styles.fallback}>
      [未实现 widget: {widget.type}]{'\n'}
      {JSON.stringify(widget.data, null, 2)}
    </div>
  );
}
