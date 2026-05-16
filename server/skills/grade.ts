/**
 * grade Skill — 批改(stub)
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const gradeSkill: Skill = {
  name: SKILL_NAMES.grade,
  description: '批改用户答案,给出评分 + 解析(stub)',
  allowedStates: ['practicing', 'grading'],
  primaryWidget: 'grading-result',
  async *handler(ctx) {
    const widgetId = ctx.makeWidgetId('grading-result');
    yield {
      type: 'text-chunk',
      payload: { text: '正在批改…' },
    };
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'grading-result',
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
            score: 80,
            isCorrect: true,
            userAnswer: 'I would like to order a steak, medium, please.',
            referenceAnswer: "I'd like to order a steak, medium-rare, please.",
            explanation:
              "整体很好。下次试试 'medium-rare'(五分熟,medium 偏向七分熟),并用缩写 I'd like 显得更自然。",
            tags: ['collocation'],
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};
