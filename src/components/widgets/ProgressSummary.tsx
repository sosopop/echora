/**
 * ProgressSummary Widget — 学习进度摘要
 *
 * 数据来源:review skill widget-ready 落到 data。
 * 本期建议项只静态展示,不触发尚未真实化的 retry action。
 */

import type { LearningWidgetInstance } from '@shared/skill';
import { useChatStore } from '../../stores/chat.js';
import styles from './widgets.module.css';

interface MasteryRow {
  tag: string;
  score: number;
  delta?: number;
}

interface SuggestionRow {
  title: string;
  desc: string;
  action?: string;
}

interface ProgressSummaryData {
  title?: string;
  sceneName?: string;
  questionsCount?: number;
  averageScore?: number;
  averageScoreDelta?: number;
  weakTagsCount?: number;
  masteredScenesCount?: number;
  masteries?: MasteryRow[];
  strongPoints?: string[];
  weakPoints?: string[];
  nextSuggestions?: SuggestionRow[];
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function masteryBand(score: number): 'good' | 'mid' | 'low' {
  if (score >= 80) return 'good';
  if (score >= 60) return 'mid';
  return 'low';
}

function deltaLabel(delta: number | undefined): string {
  if (!delta) return '本轮记录';
  return delta > 0 ? `提升 ${delta}` : `下降 ${Math.abs(delta)}`;
}

function suggestionCommand(action: string | undefined): string {
  if (!action) return '重练';
  if (action.startsWith('retry:')) {
    return `重练 ${action.slice('retry:'.length)}`;
  }
  return action;
}

export default function ProgressSummary({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as ProgressSummaryData;
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAction = useChatStore((s) => s.sendAction);
  const streaming = useChatStore((s) => s.streamingMessageId !== null);
  if (
    widget.status !== 'ready' ||
    typeof data.questionsCount !== 'number' ||
    typeof data.averageScore !== 'number'
  ) {
    return null;
  }

  const masteries = Array.isArray(data.masteries) ? data.masteries : [];
  const strongPoints = asStringArray(data.strongPoints);
  const weakPoints = asStringArray(data.weakPoints);
  const nextSuggestions = Array.isArray(data.nextSuggestions)
    ? data.nextSuggestions
    : [];

  return (
    <section className={styles.summaryCard} aria-label="学习报告">
      <header className={styles.summaryHead}>
        <div className={styles.summaryMeta}>
          学习报告 · {data.sceneName ?? '当前会话'}
        </div>
        <h2 className={styles.summaryTitle}>{data.title ?? '本轮复盘'}</h2>
      </header>

      <div className={styles.summaryStats}>
        <div className={styles.summaryStat}>
          <span className={styles.summaryStatNum}>{data.questionsCount}</span>
          <span className={styles.summaryStatLabel}>题数</span>
        </div>
        <div className={styles.summaryStat}>
          <span
            className={`${styles.summaryStatNum} ${styles.summaryStatScore}`}
          >
            {data.averageScore}
          </span>
          <span className={styles.summaryStatLabel}>平均分</span>
          {typeof data.averageScoreDelta === 'number' &&
            data.averageScoreDelta !== 0 && (
              <span className={styles.summaryDelta}>
                {data.averageScoreDelta > 0 ? '+' : ''}
                {data.averageScoreDelta}
              </span>
            )}
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryStatNum}>
            {data.weakTagsCount ?? weakPoints.length}
          </span>
          <span className={styles.summaryStatLabel}>薄弱点</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryStatNum}>
            {data.masteredScenesCount ?? 0}
          </span>
          <span className={styles.summaryStatLabel}>达标项</span>
        </div>
      </div>

      {masteries.length > 0 && (
        <div className={styles.summarySection}>
          <h3 className={styles.summarySectionTitle}>掌握度</h3>
          <div className={styles.masteryList}>
            {masteries.map((m) => {
              const score = Math.max(0, Math.min(100, Math.round(m.score)));
              return (
                <div key={m.tag} className={styles.masteryItem}>
                  <div className={styles.masteryTop}>
                    <span className={styles.masteryName}>{m.tag}</span>
                    <span className={styles.masteryScore}>{score}</span>
                  </div>
                  <div className={styles.masteryTrack}>
                    <span
                      className={`${styles.masteryFill} ${
                        styles[masteryBand(score)]
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className={styles.masteryDelta}>
                    {deltaLabel(m.delta)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.summaryColumns}>
        <div className={styles.summarySection}>
          <h3 className={styles.summarySectionTitle}>强项</h3>
          <div className={styles.summaryChips}>
            {(strongPoints.length > 0 ? strongPoints : ['完成本轮练习']).map(
              (p) => (
                <span key={p} className={`${styles.summaryChip} ${styles.ok}`}>
                  {p}
                </span>
              )
            )}
          </div>
        </div>
        <div className={styles.summarySection}>
          <h3 className={styles.summarySectionTitle}>需加强</h3>
          <div className={styles.summaryChips}>
            {(weakPoints.length > 0 ? weakPoints : ['暂无集中薄弱点']).map(
              (p) => (
                <span key={p} className={`${styles.summaryChip} ${styles.bad}`}>
                  {p}
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {nextSuggestions.length > 0 && (
        <div className={styles.summarySection}>
          <h3 className={styles.summarySectionTitle}>建议下一步</h3>
          <div className={styles.suggestionGrid}>
            {nextSuggestions.map((s) => (
              <div key={`${s.title}-${s.action ?? ''}`} className={styles.suggestionItem}>
                <div className={styles.suggestionTitle}>{s.title}</div>
                <div className={styles.suggestionDesc}>{s.desc}</div>
                <button
                  type="button"
                  className={styles.suggestionButton}
                  disabled={streaming}
                  onClick={() => {
                    if (s.action === 'request-new-scenes') {
                      void sendAction({ type: 'request-new-scenes' });
                      return;
                    }
                    void sendMessage(suggestionCommand(s.action));
                  }}
                >
                  开始
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
