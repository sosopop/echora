/**
 * scene-select Skill — 推荐场景卡片(stub)
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const sceneSelectSkill: Skill = {
  name: SKILL_NAMES.sceneSelect,
  description: '基于画像推荐 3-5 个场景卡片(stub)',
  allowedStates: ['scene_selecting', 'awaiting_next', 'reviewing'],
  primaryWidget: 'scene-cards',
  async *handler(ctx) {
    const widgetId = ctx.makeWidgetId('scene-cards');
    yield {
      type: 'text-chunk',
      payload: { text: '根据你的画像,我挑了几个场景。点一下进入。' },
    };
    yield { type: 'mode-switch', payload: { mode: 'select' } };
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'scene-cards',
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
            cards: [
              {
                id: 'school',
                emoji: '🏫',
                title: '校园对话',
                description: '同学之间的日常 · 课堂请假、借东西',
                knowledgePoint: '礼貌请求',
                difficulty: 'medium',
              },
              {
                id: 'restaurant',
                emoji: '🍝',
                title: '餐厅点餐',
                description: '点单、询问做法、结账',
                knowledgePoint: '固定搭配',
                difficulty: 'medium',
              },
              {
                id: 'travel',
                emoji: '✈️',
                title: '旅行问路',
                description: '问方向、地铁站、紧急情况',
                knowledgePoint: '介词',
                difficulty: 'medium',
              },
            ],
            allowCustom: true,
          },
        },
      },
    };
    yield { type: 'done', payload: {} };
  },
};
