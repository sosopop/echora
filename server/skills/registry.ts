/**
 * Skill Registry
 *
 * 注册中心。registerAllSkills() 内部 import 8 个 stub 并注册。
 */

import type { Skill, SkillName } from '../../shared/skill.js';

export class SkillRegistry {
  private map = new Map<string, Skill>();

  register(skill: Skill): void {
    if (this.map.has(skill.name)) {
      throw new Error(`Skill 重复注册: ${skill.name}`);
    }
    this.map.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.map.get(name);
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  list(): Skill[] {
    return Array.from(this.map.values());
  }

  names(): SkillName[] {
    return Array.from(this.map.keys()) as SkillName[];
  }
}

/**
 * 一键注册全部 8 个 stub Skill。
 * 调用方:server/index.ts 启动链路。
 */
export async function registerAllSkills(): Promise<SkillRegistry> {
  const registry = new SkillRegistry();
  // 动态 import 避免循环依赖,顺序无关
  const skills = await import('./index.js');
  for (const skill of skills.allSkills) {
    registry.register(skill);
  }
  return registry;
}
