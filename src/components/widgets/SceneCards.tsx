/**
 * SceneCards Widget — 场景推荐卡片组
 *
 * PRD §4.7;原型 doc/design/widgets/scene-cards.html
 * 数据来源:scene-select skill widget-ready 落到 data.cards
 * 交互:卡片 click → chat.sendAction({ type: 'select-scene', payload: { sceneId, ...card } })
 *      自定义卡 → 本地切回 chat 输入并聚焦
 *      底部「换一批」→ sendAction({ type: 'request-new-scenes' })
 */

import type { LearningWidgetInstance } from '@shared/skill';
import type { CefrLevel } from '@shared/api';
import { useChatStore } from '../../stores/chat.js';
import { useLearningStateStore } from '../../stores/learningState.js';
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
  message?: string;
}

export default function SceneCards({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const sendAction = useChatStore((s) => s.sendAction);
  const activateChatInput = useChatStore((s) => s.activateChatInput);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  const learningState = useLearningStateStore((s) => s.state);
  const data = (widget.data ?? {}) as SceneCardsData;
  const cards = (data.cards ?? []).slice(0, 8);
  const showCustom = data.allowCustom !== false;
  const disabled =
    widget.status !== 'ready' ||
    streaming ||
    !['scene_selecting', 'awaiting_next', 'reviewing'].includes(learningState);

  if (widget.status !== 'ready' && widget.status !== 'error') {
    return null;
  }

  if (cards.length === 0) {
    return (
      <div className={styles.sceneEmpty}>
        <div className={styles.sceneEmptyTitle}>
          {widget.status === 'error'
            ? data.message ?? '场景生成失败'
            : '还没有可用场景候选'}
        </div>
        <div className={styles.sceneEmptyDesc}>
          可以重新生成一批场景,也可以直接在下方输入想练的主题。
        </div>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={streaming}
          onClick={() => void sendAction({ type: 'request-new-scenes' })}
        >
          重新生成场景
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.sceneCards} aria-label="场景选择">
        {cards.map((c) => (
          <button
            key={c.id}
            className={styles.sceneCard}
            disabled={disabled}
            onClick={() =>
              void sendAction({
                type: 'select-scene',
                payload: {
                  sceneId: c.id,
                  title: c.title,
                  description: c.description,
                  knowledgePoint: c.knowledgePoint,
                  difficulty: c.difficulty,
                },
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
        {showCustom && (
          <button
            type="button"
            className={`${styles.sceneCard} ${styles.sceneCardCustom}`}
            disabled={disabled}
            onClick={() => activateChatInput()}
          >
            <div className={styles.sceneEmoji}>✏️</div>
            <div className={styles.sceneTitle}>自定义场景</div>
            <div className={styles.sceneDesc}>
              直接描述你想练的真实场景,我来帮你进入练习。
            </div>
            <div className={styles.sceneMeta}>
              <span>自由输入</span>
              <span>· 你的主题</span>
            </div>
          </button>
        )}
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
