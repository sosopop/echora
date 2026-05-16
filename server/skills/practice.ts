/**
 * practice Skill — 出题(stub)
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const practiceSkill: Skill = {
  name: SKILL_NAMES.practice,
  description: '生成情景练习题(stub)',
  allowedStates: ['scene_selecting', 'practicing', 'awaiting_next'],
  primaryWidget: 'exercise-card',
  async *handler(ctx) {
    const widgetId = ctx.makeWidgetId('exercise-card');
    yield {
      type: 'text-chunk',
      payload: { text: '准备好了,我们来练一题。' },
    };
    yield { type: 'mode-switch', payload: { mode: 'fill' } };
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'exercise-card',
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
            questionId: 'demo-q-1',
            questionType: 'fill_phrase',
            prompt: 'I would like to ______ a steak, ______, please.',
            context: '在西餐厅点餐',
            hint: '第 1 空动词原形 · 第 2 空熟度',
            inputMode: 'fill',
          },
        },
      },
    };
    yield {
      type: 'text-chunk',
      payload: { text: '把空填上后点击提交,我会逐空给反馈。' },
    };
    yield { type: 'done', payload: {} };
  },
};
