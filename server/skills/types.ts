/**
 * Server 侧 Skill 上下文扩展
 *
 * shared/skill.ts 的 SkillContext 不能引用后端类型(AIProvider / Db),
 * 所以在 server 层扩展。所有 server skill handler 接收 ServerSkillContext。
 *
 * Skill 接口的 handler 参数类型仍是 SkillContext;TS 方法签名 bivariant
 * 允许在赋值时接收子类型,因此 stub skill 改为接收 ServerSkillContext 后
 * 仍可注册到 SkillRegistry。
 */

import type { SkillContext } from '../../shared/skill.js';
import type { AIProvider } from '../ai/types.js';
import type { Db } from '../db/connect.js';

export interface ServerSkillContext extends SkillContext {
  provider: AIProvider;
  db: Db;
}
