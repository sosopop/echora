/**
 * ChatInput — 底部输入区,根据 chat.inputMode 切换:
 *
 *   - chat 模式:textarea + Enter 发送 → sendMessage(text)
 *   - fill 模式:textarea + Enter 提交 → sendAction({ type: 'submit-answer', ... }),
 *                attemptId 从 activeWidgets 中找最新 exercise-card.data.attemptId
 *   - select 模式:隐藏输入,展示提示「请点击上方场景卡片」(交互由 widget 自己处理)
 *   - menu 模式:留 004,本期降级为 chat
 *
 * streaming 时禁用。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useChatStore } from '../../stores/chat.js';
import { useLearningStateStore } from '../../stores/learningState.js';
import type { LearningWidgetInstance } from '@shared/skill';
import type { MessageDTO } from '@shared/api';
import styles from './index.module.css';

export default function ChatInput(): JSX.Element {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const inputMode = useChatStore((s) => s.inputMode);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const isLoading = useChatStore((s) => s.isLoading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAction = useChatStore((s) => s.sendAction);
  const activeWidgets = useChatStore((s) => s.activeWidgets);
  const messages = useChatStore((s) => s.messages);
  const learningState = useLearningStateStore((s) => s.state);

  const disabled = streaming || isLoading || text.trim().length === 0;
  const hasSceneChoices = hasSelectableSceneCards(activeWidgets, messages);
  const shouldShowSelectHint =
    inputMode === 'select' &&
    learningState === 'scene_selecting' &&
    hasSceneChoices;
  const canRecoverSceneSelect =
    inputMode === 'select' &&
    learningState === 'scene_selecting' &&
    !hasSceneChoices;
  const canStartPractice =
    inputMode === 'select' && learningState === 'practicing';

  useEffect(() => {
    if (!shouldRestoreFocusRef.current) return;
    if (streaming || isLoading || shouldShowSelectHint) return;

    const timer = window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea || textarea.disabled) return;
      textarea.focus();
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
      shouldRestoreFocusRef.current = false;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [inputMode, isLoading, learningState, shouldShowSelectHint, streaming, text]);

  const submit = async (): Promise<void> => {
    if (disabled) return;
    const value = text.trim();
    shouldRestoreFocusRef.current = true;
    setText('');
    if (
      (learningState === 'practicing' || inputMode === 'fill') &&
      !isPracticeControlText(value)
    ) {
      const attemptId = findLatestAnswerableAttemptId(
        activeWidgets,
        messages
      );
      if (!attemptId) {
        // 退化:作为普通文本发出
        await sendMessage(value);
        return;
      }
      await sendAction({
        type: 'submit-answer',
        payload: { attemptId, answer: value },
      });
    } else {
      await sendMessage(value);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  // select 模式且已有可选卡片时,隐藏输入并提示用户用 widget 操作。
  if (shouldShowSelectHint) {
    return (
      <footer className={styles.inputFooter}>
        <div className={styles.inputInner}>
          <div className={styles.selectHint}>
            👆 请在上方点击场景卡片选择,或点「换一批」。
          </div>
        </div>
      </footer>
    );
  }

  const placeholder = streaming
    ? 'Echo 正在回复...'
    : inputMode === 'fill'
    ? '输入答案后按 Enter 提交'
    : canStartPractice
    ? '练习已准备好,点击开始练习或直接告诉我...'
    : canRecoverSceneSelect
    ? '场景没加载出来,可以输入想练的主题...'
    : '直接打字告诉我...';

  return (
    <footer className={styles.inputFooter}>
      <div className={styles.inputInner}>
        <div className={styles.inputShell}>
          <button
            type="button"
            className={styles.menuBtn}
            title="学习菜单(004 实现)"
            disabled
          >
            ☰
          </button>
          <textarea
            ref={textareaRef}
            className={styles.inputTextarea}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={streaming}
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={disabled}
            onClick={() => void submit()}
          >
            发送 →
          </button>
        </div>
        <div className={canRecoverSceneSelect || canStartPractice ? styles.recoveryRow : styles.tip}>
          <span>
            {inputMode === 'fill'
              ? 'Fill 模式 · Enter 提交'
              : canStartPractice
              ? '场景已选定,可以开始第一题'
              : canRecoverSceneSelect
              ? '场景候选不可用时,可以重新生成或直接描述想练什么'
              : 'Enter 发送 · Shift + Enter 换行'}
          </span>
          {canStartPractice && (
            <button
              type="button"
              className={styles.retrySceneBtn}
              disabled={streaming || isLoading}
              onClick={() => void sendAction({ type: 'next-question' })}
            >
              开始练习
            </button>
          )}
          {canRecoverSceneSelect && (
            <button
              type="button"
              className={styles.retrySceneBtn}
              disabled={streaming || isLoading}
              onClick={() => void sendAction({ type: 'request-new-scenes' })}
            >
              重新生成场景
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}

function isPracticeControlText(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?。！？\s]+/g, '');
  if (!normalized) return false;
  return [
    '出题',
    '开始',
    '开始练习',
    '继续',
    '下一题',
    '下一个',
    '换场景',
    '换一批',
    '重新生成场景',
    'go',
    'next',
    'start',
    'continue',
  ].includes(normalized);
}

function hasSelectableSceneCards(
  activeWidgets: Record<string, LearningWidgetInstance>,
  messages: MessageDTO[]
): boolean {
  const latest = findLatestSceneCardsWidget(activeWidgets, messages);
  if (!latest || latest.status !== 'ready') return false;
  const cards = (latest.data as { cards?: unknown[] }).cards;
  return Array.isArray(cards) && cards.length > 0;
}

function findLatestSceneCardsWidget(
  activeWidgets: Record<string, LearningWidgetInstance>,
  messages: MessageDTO[]
): LearningWidgetInstance | null {
  const seen = new Set<string>();
  const widgets: LearningWidgetInstance[] = [];

  for (const msg of messages) {
    const snap = msg.widgetSnapshot as Partial<LearningWidgetInstance> | null;
    if (!snap?.id || snap.type !== 'scene-cards') continue;
    const live = activeWidgets[snap.id];
    const widget: LearningWidgetInstance = live ?? {
      id: snap.id,
      type: snap.type,
      status: snap.status ?? 'ready',
      data: snap.data ?? {},
      version: snap.version ?? 1,
    };
    widgets.push(widget);
    seen.add(widget.id);
  }

  for (const widget of Object.values(activeWidgets)) {
    if (widget.type !== 'scene-cards' || seen.has(widget.id)) continue;
    widgets.push(widget);
  }

  return widgets[widgets.length - 1] ?? null;
}

function findLatestAnswerableAttemptId(
  activeWidgets: Record<string, LearningWidgetInstance>,
  messages: MessageDTO[]
): number | null {
  const widgets = collectWidgets(activeWidgets, messages);
  const latestExercise = widgets
    .filter((w) => w.type === 'exercise-card')
    .at(-1);
  const attemptId = (latestExercise?.data as { attemptId?: number } | undefined)
    ?.attemptId;
  if (typeof attemptId !== 'number') return null;

  const latestGrade = widgets
    .filter((w) => {
      if (w.type !== 'grading-result') return false;
      return (w.data as { attemptId?: number }).attemptId === attemptId;
    })
    .at(-1);
  if (!latestGrade) return attemptId;
  return (latestGrade.data as { isCorrect?: boolean }).isCorrect === true
    ? null
    : attemptId;
}

function collectWidgets(
  activeWidgets: Record<string, LearningWidgetInstance>,
  messages: MessageDTO[]
): LearningWidgetInstance[] {
  const seen = new Set<string>();
  const widgets: LearningWidgetInstance[] = [];

  for (const msg of messages) {
    const snap = msg.widgetSnapshot as Partial<LearningWidgetInstance> | null;
    if (!snap?.id || !snap.type) continue;
    const live = activeWidgets[snap.id];
    const widget: LearningWidgetInstance = live ?? {
      id: snap.id,
      type: snap.type,
      status: snap.status ?? 'ready',
      data: snap.data ?? {},
      version: snap.version ?? 1,
    };
    widgets.push(widget);
    seen.add(widget.id);
  }

  for (const widget of Object.values(activeWidgets)) {
    if (seen.has(widget.id)) continue;
    widgets.push(widget);
  }

  return widgets;
}
