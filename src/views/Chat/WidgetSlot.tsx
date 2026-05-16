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
}): JSX.Element {
  return (
    <div className={styles.widgetSlot}>
      <WidgetRenderer widget={widget} />
    </div>
  );
}
