/**
 * Stub Provider — 默认 AI Provider,零外部依赖
 *
 * route() 固定返回 general-chat decision,具体业务由各 Skill stub 自产 SkillEvent。
 * 用于本地开发与未来 Provider 异常的兜底。
 */

import type { AIProvider } from '../types.js';
import type { RouterInput, RouterDecision } from '../../../shared/skill.js';
import { SKILL_NAMES } from '../../../shared/skill.js';

export class StubProvider implements AIProvider {
  readonly name = 'stub';

  async route(_input: RouterInput): Promise<RouterDecision> {
    return {
      skillName: SKILL_NAMES.generalChat,
      params: {},
      confidence: 0.6,
      rationale: 'stub provider 默认路由',
    };
  }
}
