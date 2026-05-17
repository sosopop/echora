/**
 * LearningMenu Widget — 输入区学习菜单的嵌入式版本。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import { useChatStore } from '../../stores/chat.js';
import { runWidgetAction } from './actionProtocol.js';
import styles from './widgets.module.css';

interface LearningMenuItem {
  id: string;
  icon: string;
  label: string;
  action: string;
  primary?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

interface LearningMenuSection {
  title: string;
  items: LearningMenuItem[];
}

interface LearningMenuData {
  sections?: LearningMenuSection[];
}

export default function LearningMenu({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAction = useChatStore((s) => s.sendAction);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const data = (widget.data ?? {}) as LearningMenuData;
  const sections = Array.isArray(data.sections) ? data.sections : [];

  if (widget.status !== 'ready' || sections.length === 0) return null;

  return (
    <section className={styles.learningMenuCard} aria-label="学习菜单">
      {sections.map((section) => (
        <div key={section.title} className={styles.learningMenuSection}>
          <h3 className={styles.learningMenuTitle}>{section.title}</h3>
          <div className={styles.learningMenuItems}>
            {section.items.map((item) => {
              const disabled = streaming || item.disabled === true;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.learningMenuItem} ${
                    item.primary ? styles.primary : ''
                  }`}
                  disabled={disabled}
                  title={item.disabledReason}
                  onClick={() =>
                    runWidgetAction(item.action, { sendMessage, sendAction })
                  }
                >
                  <span className={styles.learningMenuIcon}>{item.icon}</span>
                  <span className={styles.learningMenuLabel}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
