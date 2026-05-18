/**
 * general-chat Skill — 低风险闲聊与低置信度意图确认。
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';

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
    const serverCtx = ctx as ServerSkillContext;
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

    const userText =
      typeof ctx.params.userText === 'string' ? ctx.params.userText.trim() : '';
    if (userText && serverCtx.provider.chat) {
      let emitted = false;
      try {
        for await (const ev of serverCtx.provider.chat({
          system:
            '你是 Echora 的英语学习教练。当前不是练习或批改锁定态,可以进行低风险闲聊。' +
            '回复要简短、温和,优先把用户自然引导回英语场景练习、复盘或重练。' +
            '不要声称已经执行系统动作;如果用户想练习,建议他说"开始练习"或"换场景"。',
          messages: [{ role: 'user', content: userText }],
          maxTokens: 500,
          signal: serverCtx.signal,
        })) {
          if (ev.type === 'text-delta' && ev.text) {
            emitted = true;
            yield { type: 'text-chunk', payload: { text: ev.text } };
          }
        }
      } catch (e) {
        if (serverCtx.signal.aborted || isAbortError(e)) {
          return;
        }
        yield {
          type: 'error',
          payload: {
            code: 'GENERAL_CHAT_FAILED',
            message: e instanceof Error ? e.message : String(e),
          },
        };
        return;
      }
      if (emitted) {
        yield { type: 'done', payload: {} };
        return;
      }
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

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
