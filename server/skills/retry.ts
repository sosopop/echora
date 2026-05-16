/**
 * retry Skill — 基于薄弱点重练(stub)
 *
 * 复用 practice 的 widget 模板,标"重练专场"。
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const retrySkill: Skill = {
  name: SKILL_NAMES.retry,
  description: '基于历史薄弱点生成新题(stub · 重练专场)',
  allowedStates: ['awaiting_next', 'reviewing', 'scene_selecting'],
  primaryWidget: 'exercise-card',
  async *handler(ctx) {
    const widgetId = ctx.makeWidgetId('exercise-card');
    yield {
      type: 'text-chunk',
      payload: {
        text: '重练专场:基于你最近的薄弱点(missing_word),来一题。',
      },
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
            questionId: 'retry-q-1',
            questionType: 'fill_word',
            prompt: 'I want ______ order a soup.',
            context: '重练:不定式 to',
            hint: '介于 want 与原形动词之间的小词',
            inputMode: 'fill',
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};
