/**
 * 消息列表 — 渲染会话历史 + 当前 streaming 消息 + 嵌入 widget
 *
 * 规则:
 *   - 用户/assistant/system 消息按 seq 顺序渲染
 *   - 消息 widget_snapshot 不为空时,渲染 WidgetRenderer
 *   - assistant 消息若 id === streamingMessageId 且 streamBuffer 有内容,优先用 buffer 显示
 *   - 关注 activeWidgets:assistant 消息渲染时,如果 widget_snapshot 中的 widgetId 在 activeWidgets 里有更新版本,优先用 activeWidgets
 */

import { useEffect, useRef } from 'react';
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamBuffer, activeWidgets]);

  const visible = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system'
  );

  return (
    <div className={styles.messageList}>
      {visible.map((m) => {
        const isStreaming = streamingId === m.id;
        const text = isStreaming
          ? streamBuffer[m.id] ?? m.content ?? ''
          : m.content ?? '';
        // widget 来源:优先 activeWidgets(最新),其次 widget_snapshot(历史)
        const widget = resolveWidget(m, activeWidgets);
        return (
          <div key={m.id} className={styles.messageRow}>
            <MessageBubble
              role={m.role}
              text={text}
              streaming={isStreaming}
            />
            {widget && <WidgetSlot widget={widget} />}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

interface MessageWithWidget {
  id: number;
  widgetSnapshot: unknown | null;
}

function resolveWidget(
  msg: MessageWithWidget,
  active: Record<string, LearningWidgetInstance>
): LearningWidgetInstance | null {
  if (!msg.widgetSnapshot) return null;
  const snap = msg.widgetSnapshot as Partial<LearningWidgetInstance>;
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
