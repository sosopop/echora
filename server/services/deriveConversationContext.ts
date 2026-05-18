/**
 * 归档会话派生上下文
 *
 * 从源会话最近一次 progress-summary / review 记录中提炼显式上下文文本,
 * 用于派生新会话时作为首条 system message。
 */

import type { Db } from '../db/connect.js';
import { getMessages } from './message.js';
import type { MessageDTO } from '../../shared/api.js';

interface ProgressSummaryWidgetData {
  sceneName?: string;
  title?: string;
  questionsCount?: number;
  categoryCounts?: {
    exact?: number;
    similar?: number;
    incorrect?: number;
  };
  weakPoints?: string[];
  strongPoints?: string[];
  nextSuggestions?: Array<{
    title?: string;
    desc?: string;
  }>;
}

interface WidgetSnapshotLike {
  id?: string;
  type?: string;
  data?: unknown;
}

export function buildDerivedConversationContextText(
  db: Db,
  sourceConversationId: number,
  sourceTitle: string | null
): string | null {
  const review = findLatestProgressSummary(
    getMessages(db, sourceConversationId)
  );
  if (!review) {
    const title = sourceTitle?.trim();
    return title
      ? `继承自上一轮「${title}」的练习上下文。系统没有找到可直接复用的结构化复盘摘要,会从同一场景继续带你往下练。`
      : '继承自上一轮练习上下文。系统没有找到可直接复用的结构化复盘摘要,会从当前场景继续带你往下练。';
  }

  const sceneName = review.sceneName?.trim() || sourceTitle?.trim() || '上一轮场景';
  const categoryCounts = review.categoryCounts ?? {};
  const weakPoints = dedupe(review.weakPoints ?? []).slice(0, 3);
  const strongPoints = dedupe(review.strongPoints ?? []).slice(0, 3);
  const suggestions = dedupe(
    (review.nextSuggestions ?? [])
      .map((item) => item.title?.trim())
      .filter((title): title is string => Boolean(title))
  ).slice(0, 2);

  const lines = [
    `继承自上一轮复盘 · ${sceneName}`,
    `结果：完全正确 ${categoryCounts.exact ?? 0} 题 / 还不错 ${categoryCounts.similar ?? 0} 题 / 错误 ${categoryCounts.incorrect ?? 0} 题`,
  ];
  if (strongPoints.length > 0) {
    lines.push(`强项：${strongPoints.join('；')}`);
  }
  if (weakPoints.length > 0) {
    lines.push(`薄弱点：${weakPoints.join('；')}`);
  }
  if (suggestions.length > 0) {
    lines.push(`下一步建议：${suggestions.join('；')}`);
  }
  lines.push(`这轮再练会从同场景继续，重点把上一轮暴露出来的问题压下去。`);
  return lines.join('\n');
}

function findLatestProgressSummary(
  messages: MessageDTO[]
): ProgressSummaryWidgetData | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    for (const snap of widgetSnapshotToArray(msg.widgetSnapshot)) {
      if (snap.type !== 'progress-summary' || !snap.data) continue;
      return snap.data as ProgressSummaryWidgetData;
    }
  }
  return null;
}

function widgetSnapshotToArray(snapshot: unknown): WidgetSnapshotLike[] {
  if (Array.isArray(snapshot)) {
    return snapshot.filter(
      (item): item is WidgetSnapshotLike =>
        typeof item === 'object' && item !== null
    );
  }
  if (typeof snapshot === 'object' && snapshot !== null) {
    return [snapshot as WidgetSnapshotLike];
  }
  return [];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
