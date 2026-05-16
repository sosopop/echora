/**
 * Widget 容器槽位 — 嵌入 AI 消息下方,调 WidgetRenderer 分发
 */

import type { LearningWidgetInstance } from '@shared/skill';
import WidgetRenderer from '../../components/widgets/WidgetRenderer.js';
import styles from './index.module.css';

export default function WidgetSlot({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  if (!shouldRenderWidget(widget)) {
    return null;
  }
  return (
    <div className={styles.widgetSlot}>
      <WidgetRenderer widget={widget} />
    </div>
  );
}

function shouldRenderWidget(widget: LearningWidgetInstance): boolean {
  if (widget.status === 'loading') return false;

  if (widget.type === 'scene-cards') {
    return widget.status === 'ready' || widget.status === 'error';
  }

  if (widget.type === 'grading-result') {
    const data = widget.data as
      | { score?: unknown; isCorrect?: unknown }
      | undefined;
    return (
      widget.status === 'ready' &&
      typeof data?.score === 'number' &&
      typeof data?.isCorrect === 'boolean'
    );
  }

  if (widget.type === 'exercise-card') {
    const data = widget.data as
      | {
          attemptId?: unknown;
          stage?: unknown;
          questionNo?: unknown;
          questionType?: unknown;
          contextZh?: unknown;
        }
      | undefined;
    return (
      widget.status === 'ready' &&
      typeof data?.attemptId === 'number' &&
      typeof data?.stage === 'number' &&
      typeof data?.questionNo === 'number' &&
      typeof data?.questionType === 'string' &&
      typeof data?.contextZh === 'string' &&
      data.contextZh.trim().length > 0
    );
  }

  return true;
}
