/**
 * general-chat Skill — 低风险闲聊与低置信度意图确认。
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

interface IntentConfirmParams {
  question?: string;
  prompt?: string;
  choices?: Array<{
    id: string;
    title: string;
    desc?: string;
    action: string;
  }>;
  risk?: 'low' | 'medium' | 'high';
}

export const generalChatSkill: Skill = {
  name: SKILL_NAMES.generalChat,
  description: '兜底 Skill,处理低风险闲聊与意图确认',
  allowedStates: [], // 空数组 = 任意态可用;锁定态限制由 chat route 额外拦截
  primaryWidget: 'intent-confirm',

  async *handler(ctx) {
    const intentConfirm = ctx.params.intentConfirm as
      | IntentConfirmParams
      | undefined;
    if (intentConfirm?.choices?.length) {
      const widgetId = ctx.makeWidgetId('intent-confirm');
      yield {
        type: 'text-chunk',
        payload: {
          text:
            intentConfirm.prompt?.trim()
              ? `我不太确定你说的“${intentConfirm.prompt.trim()}”想做哪件事。`
              : '我不太确定你想做哪件事。',
        },
      };
      yield {
        type: 'widget-init',
        payload: {
          widget: {
            id: widgetId,
            type: 'intent-confirm',
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
              question: intentConfirm.question ?? '你想让我怎么处理?',
              choices: intentConfirm.choices.slice(0, 3),
              risk: intentConfirm.risk ?? 'medium',
              requireExplicitConfirm: false,
            },
          },
        },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    yield {
      type: 'text-chunk',
      payload: {
        text: '我收到啦。你可以告诉我"开始练习"、"换场景",或者直接打字描述你想练什么。',
      },
    };
    yield { type: 'done', payload: {} };
  },
};
