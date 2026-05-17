/**
 * IntentConfirm Widget — 低置信度路由确认。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import { useChatStore } from '../../stores/chat.js';
import { runWidgetAction } from './actionProtocol.js';
import styles from './widgets.module.css';

interface IntentChoice {
  id: string;
  title: string;
  desc?: string;
  action: string;
}

interface IntentConfirmData {
  question?: string;
  choices?: IntentChoice[];
  risk?: 'low' | 'medium' | 'high';
  requireExplicitConfirm?: boolean;
}

export default function IntentConfirm({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAction = useChatStore((s) => s.sendAction);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const data = (widget.data ?? {}) as IntentConfirmData;
  const choices = data.choices ?? [];
  if (
    widget.status !== 'ready' ||
    !data.question?.trim() ||
    choices.length < 2
  ) {
    return null;
  }

  return (
    <section
      className={`${styles.intentConfirm} ${
        data.risk === 'high' ? styles.highRisk : ''
      }`}
      aria-label={data.question}
    >
      <div className={styles.intentHead}>
        <h3 className={styles.intentQuestion}>{data.question}</h3>
        <span className={styles.intentRisk}>
          {data.risk === 'high' ? '高风险' : '需要确认'}
        </span>
      </div>
      <div className={styles.intentChoices}>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={styles.intentChoice}
            disabled={streaming}
            onClick={() =>
              runWidgetAction(choice.action, { sendMessage, sendAction })
            }
          >
            <span className={styles.intentChoiceText}>
              <span className={styles.intentChoiceTitle}>{choice.title}</span>
              {choice.desc && (
                <span className={styles.intentChoiceDesc}>{choice.desc}</span>
              )}
            </span>
            <span className={styles.intentChoiceArrow} aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
