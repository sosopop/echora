/**
 * SceneCards Widget — 场景推荐卡片组
 *
 * PRD §4.7;原型 doc/design/widgets/scene-cards.html
 * 数据来源:scene-select skill widget-ready 落到 data.cards
 * 交互:卡片 click → chat.sendAction({ type: 'select-scene', payload: { sceneId } })
 *      底部「换一批」→ sendAction({ type: 'request-new-scenes' })
 */

import type { LearningWidgetInstance } from '@shared/skill';
import type { CefrLevel } from '@shared/api';
import { useChatStore } from '../../stores/chat.js';
import styles from './widgets.module.css';

interface SceneCard {
  id: string;
  emoji?: string;
  title: string;
  description: string;
  knowledgePoint?: string;
  difficulty?: CefrLevel;
}

interface SceneCardsData {
  cards?: SceneCard[];
  allowCustom?: boolean;
}

export default function SceneCards({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element {
  const sendAction = useChatStore((s) => s.sendAction);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const data = (widget.data ?? {}) as SceneCardsData;
  const cards = data.cards ?? [];
  const disabled = widget.status !== 'ready' || streaming;

  if (cards.length === 0) {
    return <div className={styles.fallback}>(暂无场景候选)</div>;
  }

  return (
    <div>
      <div className={styles.sceneCards}>
        {cards.map((c) => (
          <button
            key={c.id}
            className={styles.sceneCard}
            disabled={disabled}
            onClick={() =>
              void sendAction({
                type: 'select-scene',
                payload: { sceneId: c.id },
              })
            }
            type="button"
          >
            <div className={styles.sceneEmoji}>{c.emoji ?? '💬'}</div>
            <div className={styles.sceneTitle}>{c.title}</div>
            <div className={styles.sceneDesc}>{c.description}</div>
            <div className={styles.sceneMeta}>
              {c.knowledgePoint && <span>{c.knowledgePoint}</span>}
              {c.difficulty && <span>· {c.difficulty}</span>}
            </div>
          </button>
        ))}
      </div>
      <div className={styles.sceneFoot}>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={disabled}
          onClick={() => void sendAction({ type: 'request-new-scenes' })}
        >
          换一批
        </button>
      </div>
    </div>
  );
}
