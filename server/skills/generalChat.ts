/**
 * general-chat Skill — 兜底闲聊(stub)
 *
 * 任何无法路由到其他 Skill 的输入默认走这里。
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const generalChatSkill: Skill = {
  name: SKILL_NAMES.generalChat,
  description: '兜底 Skill,处理一般聊天(stub)',
  allowedStates: [], // 空数组 = 任意态可用
  async *handler(ctx) {
    yield {
      type: 'text-chunk',
      payload: {
        text: '我收到啦。你可以告诉我"开始练习"、"换场景",或者直接打字描述你想练什么。',
      },
    };
    yield { type: 'done', payload: {} };
  },
};
