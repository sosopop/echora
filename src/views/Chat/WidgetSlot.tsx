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
      | { category?: unknown; score?: unknown; isCorrect?: unknown }
      | undefined;
    const hasCategory =
      data?.category === 'exact' ||
      data?.category === 'similar' ||
      data?.category === 'incorrect';
    const hasLegacyResult = typeof data?.isCorrect === 'boolean';
    return (
      widget.status === 'ready' &&
      (hasCategory || hasLegacyResult)
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

  if (widget.type === 'conversation-lock') {
    const data = widget.data as
      | { title?: unknown; description?: unknown }
      | undefined;
    return (
      widget.status === 'ready' &&
      typeof data?.title === 'string' &&
      data.title.trim().length > 0 &&
      typeof data?.description === 'string' &&
      data.description.trim().length > 0
    );
  }

  if (widget.type === 'follow-up-source') {
    const data = widget.data as
      | { sourceLabel?: unknown; snippet?: unknown }
      | undefined;
    return (
      widget.status === 'ready' &&
      typeof data?.sourceLabel === 'string' &&
      data.sourceLabel.trim().length > 0 &&
      typeof data?.snippet === 'string' &&
      data.snippet.trim().length > 0
    );
  }

  if (widget.type === 'intent-confirm') {
    const data = widget.data as
      | { question?: unknown; choices?: unknown }
      | undefined;
    return (
      widget.status === 'ready' &&
      typeof data?.question === 'string' &&
      data.question.trim().length > 0 &&
      Array.isArray(data?.choices) &&
      data.choices.length >= 2
    );
  }

  return true;
}
