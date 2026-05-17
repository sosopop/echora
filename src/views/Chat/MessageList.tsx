/**
 * 消息列表 — 渲染会话历史 + 当前 streaming 消息 + 嵌入 widget
 *
 * 规则:
 *   - 用户/assistant/system 消息按 seq 顺序渲染
 *   - 消息 widget_snapshot 不为空时,渲染 WidgetRenderer
 *   - assistant 消息若 id === streamingMessageId 且 streamBuffer 有内容,优先用 buffer 显示
 *   - 关注 activeWidgets:assistant 消息渲染时,如果 widget_snapshot 中的 widgetId 在 activeWidgets 里有更新版本,优先用 activeWidgets
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chat.js';
import MessageBubble from './MessageBubble.js';
import WidgetSlot from './WidgetSlot.js';
import type { LearningWidgetInstance } from '@shared/skill';
import styles from './index.module.css';

export default function MessageList(): JSX.Element {
  const messages = useChatStore((s) => s.messages);
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const activeWidgets = useChatStore((s) => s.activeWidgets);
  const branchSourceMessageId = useChatStore((s) => s.branchSourceMessageId);
  const openBranchForMessage = useChatStore((s) => s.openBranchForMessage);
  const listRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const visible = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system'
  );

  const scrollToPageBottom = useCallback((behavior: ScrollBehavior): void => {
    const root = document.scrollingElement ?? document.documentElement;
    window.scrollTo({ top: root.scrollHeight, behavior });
  }, []);

  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto'): void => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        scrollToPageBottom(behavior);
        window.requestAnimationFrame(() => scrollToPageBottom('auto'));
        window.setTimeout(() => scrollToPageBottom('auto'), 80);
        window.setTimeout(() => scrollToPageBottom('auto'), 220);
      });
    },
    [scrollToPageBottom]
  );

  useLayoutEffect(() => {
    scheduleScrollToBottom('auto');
  }, [visible.length, streamingId, scheduleScrollToBottom]);

  useEffect(() => {
    scheduleScrollToBottom(streamingId ? 'auto' : 'smooth');
  }, [streamBuffer, activeWidgets, scheduleScrollToBottom, streamingId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      scheduleScrollToBottom('auto');
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scheduleScrollToBottom]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    },
    []
  );

  return (
    <div className={styles.messageList} ref={listRef}>
      {visible.map((m) => {
        const isStreaming = streamingId === m.id;
        const text = isStreaming
          ? streamBuffer[m.id] ?? m.content ?? ''
          : m.content ?? '';
        // widget 来源:优先 activeWidgets(最新),其次 widget_snapshot(历史)
        const widgets = resolveWidgets(m, activeWidgets);
        return (
          <div key={m.id} className={styles.messageRow}>
            <MessageBubble
              role={m.role}
              text={text}
              streaming={isStreaming}
              referenced={branchSourceMessageId === m.id}
              onOpenBranch={
                m.role === 'system'
                  ? undefined
                  : () => {
                      void openBranchForMessage(m.id);
                    }
              }
            />
            {widgets.map((widget) => (
              <WidgetSlot key={widget.id} widget={widget} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface MessageWithWidget {
  id: number;
  widgetSnapshot: unknown | null;
}

function resolveWidgets(
  msg: MessageWithWidget,
  active: Record<string, LearningWidgetInstance>
): LearningWidgetInstance[] {
  if (!msg.widgetSnapshot) return [];
  const snaps = Array.isArray(msg.widgetSnapshot)
    ? (msg.widgetSnapshot as Partial<LearningWidgetInstance>[])
    : ([msg.widgetSnapshot] as Partial<LearningWidgetInstance>[]);
  return snaps
    .map((snap) => resolveWidget(snap, active))
    .filter((widget): widget is LearningWidgetInstance => widget !== null);
}

function resolveWidget(
  snap: Partial<LearningWidgetInstance>,
  active: Record<string, LearningWidgetInstance>
): LearningWidgetInstance | null {
  if (!snap.id || !snap.type) return null;
  const live = active[snap.id];
  if (live) return live;
  // 历史 snapshot 兜底
  return {
    id: snap.id,
    type: snap.type,
    status: snap.status ?? 'ready',
    data: snap.data ?? {},
    version: snap.version ?? 1,
  };
}
