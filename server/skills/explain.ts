/**
 * explain Skill — 深入解析(stub)
 *
 * 触发场景:用户在右侧支线追问。
 * 真实业务后续接入:基于 source_ref 携带的题目/标签生成解释。
 */

import type { Skill } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';

export const explainSkill: Skill = {
  name: SKILL_NAMES.explain,
  description: '针对题目/语法/词汇做深入解析(stub)',
  allowedStates: [
    'practicing',
    'grading',
    'awaiting_next',
    'reviewing',
    'scene_selecting',
  ],
  async *handler(ctx) {
    yield {
      type: 'text-chunk',
      payload: {
        text: "你问到的这个点,简单说:I'd like 是 I would like 的缩写,",
      },
    };
    yield {
      type: 'text-chunk',
      payload: {
        text: '用条件式包装请求,把"我要"变成"我会喜欢",',
      },
    };
    yield {
      type: 'text-chunk',
      payload: {
        text: '在餐厅、商店、办公室是默认的礼貌表达。直接 I want 不算错,只是更直白。',
      },
    };
    yield { type: 'done', payload: {} };
  },
};
