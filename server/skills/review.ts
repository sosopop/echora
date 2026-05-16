/**
 * review Skill — 学习报告(stub)
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const reviewSkill: Skill = {
  name: SKILL_NAMES.review,
  description: '查询学习记录,生成文字版学习报告(stub)',
  allowedStates: ['awaiting_next', 'reviewing', 'scene_selecting', 'archived'],
  primaryWidget: 'progress-summary',
  async *handler(ctx) {
    const widgetId = ctx.makeWidgetId('progress-summary');
    yield {
      type: 'text-chunk',
      payload: { text: '本轮 5 题做完啦 ✨ 来看看这次的总结。' },
    };
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'progress-summary',
          status: 'loading',
          data: {},
          version: 1,
        },
      },
    };
    yield {
      type: 'widget-ready',
      payload: {
        widgetId,
        patch: {
          status: 'ready',
          data: {
            title: '学习报告 · 第 3 轮',
            sceneName: '餐厅点餐',
            questionsCount: 5,
            averageScore: 82,
            averageScoreDelta: 12,
            weakTagsCount: 2,
            masteredScenesCount: 3,
            masteries: [
              { tag: 'politeness', score: 80, delta: 18 },
              { tag: 'collocation', score: 60, delta: 12 },
              { tag: 'missing_word', score: 30, delta: 0 },
            ],
            strongPoints: ["politeness · I'd like / Could I"],
            weakPoints: ['missing_word · 不定式 to'],
            nextSuggestions: [
              {
                title: '🎯 重练 missing_word',
                desc: '基于 2 道错题,生成 3 题专项,5 分钟。',
                action: 'retry:missing_word',
              },
            ],
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};
