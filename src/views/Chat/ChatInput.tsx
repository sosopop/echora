/**
 * ChatInput — 底部输入区,根据 chat.inputMode 切换:
 *
 *   - chat 模式:textarea + Enter 发送 → sendMessage(text)
 *   - fill 模式:textarea + Enter 提交 → sendAction({ type: 'submit-answer', ... }),
 *                attemptId 从 activeWidgets 中找最新 exercise-card.data.attemptId
 *   - select 模式:隐藏输入,展示提示「请点击上方场景卡片」(交互由 widget 自己处理)
 *   - menu 模式:左侧按钮打开本地学习菜单
 *
 * streaming 时禁用。
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useChatStore } from '../../stores/chat.js';
import { useLearningStateStore } from '../../stores/learningState.js';
import { runWidgetAction } from '../../components/widgets/actionProtocol.js';
import type { LearningWidgetInstance } from '@shared/skill';
import type { MessageDTO } from '@shared/api';
import styles from './index.module.css';

export default function ChatInput(): JSX.Element {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
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

  const busy = streaming || isLoading;
  const disabled = busy || text.trim().length === 0;
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
  const menuSections = buildLearningMenuSections(learningState, inputMode);

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

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const submit = async (): Promise<void> => {
    if (disabled) return;
    const value = text.trim();
    setMenuOpen(false);
    setMenuNotice(null);
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

  const runMenuItem = (action: string): void => {
    setMenuOpen(false);
    setMenuNotice(null);
    shouldRestoreFocusRef.current = true;
    runWidgetAction(action, {
      sendMessage,
      sendAction,
      onLocalSaveProgress: () => {
        setMenuNotice('当前进度已自动保存。');
      },
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
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
            aria-label={menuOpen ? '关闭学习菜单' : '打开学习菜单'}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="chat-learning-menu"
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          {menuOpen && (
            <div
              id="chat-learning-menu"
              className={styles.learningMenuPopover}
              role="menu"
            >
              {menuSections.map((section) => (
                <div key={section.title} className={styles.learningMenuSection}>
                  <div className={styles.learningMenuTitle}>
                    {section.title}
                  </div>
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={`${styles.learningMenuItem} ${
                        item.primary ? styles.learningMenuItemPrimary : ''
                      }`}
                      disabled={busy || item.disabled}
                      title={item.disabledReason}
                      onClick={() => runMenuItem(item.action)}
                    >
                      <span className={styles.learningMenuIcon}>
                        {item.icon}
                      </span>
                      <span className={styles.learningMenuText}>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
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
        {menuNotice && (
          <div className={styles.menuNotice} role="status">
            {menuNotice}
          </div>
        )}
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

interface LocalMenuItem {
  id: string;
  icon: string;
  label: string;
  action: string;
  primary?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

interface LocalMenuSection {
  title: string;
  items: LocalMenuItem[];
}

function buildLearningMenuSections(
  learningState: string,
  inputMode: string
): LocalMenuSection[] {
  const isOnboarding = learningState === 'onboarding';
  const isGrading = learningState === 'grading';
  const isArchived = learningState === 'archived';
  const isPracticing = learningState === 'practicing';
  const canUseMainFlow = !isOnboarding && !isGrading && !isArchived;
  const canStartFromSelect = isPracticing && inputMode === 'select';

  const continueLabel =
    learningState === 'scene_selecting'
      ? '换一批场景'
      : learningState === 'awaiting_next' || learningState === 'reviewing'
      ? '开始新场景'
      : canStartFromSelect
      ? '开始练习'
      : '继续练习';
  const continueAction =
    learningState === 'scene_selecting' ||
    learningState === 'awaiting_next' ||
    learningState === 'reviewing'
      ? 'action:request-new-scenes'
      : 'action:next-question';
  const continueDisabled =
    !canUseMainFlow || (isPracticing && !canStartFromSelect);

  return [
    {
      title: '主线',
      items: [
        {
          id: 'continue',
          icon: '>',
          label: continueLabel,
          action: continueAction,
          primary: true,
          disabled: continueDisabled,
          disabledReason: isPracticing
            ? '先完成当前题,正确后会自动继续'
            : isGrading
            ? '批改完成后可继续'
            : isArchived
            ? '归档会话只能复盘'
            : undefined,
        },
        {
          id: 'scenes',
          icon: '#',
          label: '换场景',
          action: 'action:request-new-scenes',
          disabled: !canUseMainFlow,
          disabledReason: isGrading
            ? '批改完成后可换场景'
            : isArchived
            ? '归档会话不能继续练习'
            : undefined,
        },
      ],
    },
    {
      title: '复盘',
      items: [
        {
          id: 'review',
          icon: '?',
          label: '查看复盘',
          action: 'text:复盘',
          disabled: ![
            'awaiting_next',
            'reviewing',
            'scene_selecting',
            'archived',
          ].includes(learningState),
          disabledReason: '完成当前题后可查看复盘',
        },
        {
          id: 'retry',
          icon: '+',
          label: '复习薄弱点',
          action: 'text:重练',
          disabled: ![
            'awaiting_next',
            'reviewing',
            'scene_selecting',
          ].includes(learningState),
          disabledReason: '进入复盘或待继续后可重练',
        },
        {
          id: 'save',
          icon: '.',
          label: '保存进度',
          action: 'local:save-progress',
        },
      ],
    },
  ];
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
