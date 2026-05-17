/**
 * AccountGate Widget — 账号/保存进度提示。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import { useChatStore } from '../../stores/chat.js';
import { runWidgetAction } from './actionProtocol.js';
import styles from './widgets.module.css';

interface AccountGateData {
  intent?: 'save_progress' | 'login_required' | 'privacy' | 'delete_account';
  title?: string;
  description?: string;
  primaryAction?: { label: string; action: string };
  secondaryAction?: { label: string; action: string };
}

export default function AccountGate({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAction = useChatStore((s) => s.sendAction);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const data = (widget.data ?? {}) as AccountGateData;

  if (
    widget.status !== 'ready' ||
    !data.title?.trim() ||
    !data.description?.trim() ||
    !data.primaryAction?.label?.trim()
  ) {
    return null;
  }

  const actions = [data.primaryAction, data.secondaryAction].filter(
    (action): action is { label: string; action: string } => Boolean(action)
  );

  return (
    <section className={styles.accountGate} aria-label={data.title}>
      <div className={styles.accountGateMark}>
        {data.intent === 'save_progress' ? '存' : '账'}
      </div>
      <div className={styles.accountGateBody}>
        <h3 className={styles.accountGateTitle}>{data.title}</h3>
        <p className={styles.accountGateDesc}>{data.description}</p>
        <div className={styles.accountGateActions}>
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${action.action}`}
              type="button"
              className={
                index === 0 ? styles.btnPrimary : styles.btnGhost
              }
              disabled={streaming}
              onClick={() =>
                runWidgetAction(action.action, {
                  sendMessage,
                  sendAction,
                })
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
