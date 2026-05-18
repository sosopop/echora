/**
 * onboarding Skill 辅助:字段缺失判定 + system prompt + tool 定义
 *
 * 必填字段:name, level(CEFR A1-C2)。
 * 选填字段:age, grade(自然语言年级,如「高二」「大二」「在职」)。
 *
 * 字段缺失判定有两种维度,务必区分:
 *   - decideMissingRequired:仅必填字段是否缺(决定 onboarding 是否可结束)
 *   - decidePromptMissingFields:必填 + 用于追问 prompt 的可选字段(grade)
 *     供系统提示中"还需采集"措辞用,不影响结束判定
 */

import type { ProfileDTO } from '../../../shared/api.js';
import type { ToolDef } from '../../ai/types.js';

export type OnboardingField = 'name' | 'age' | 'grade' | 'level';

export const REQUIRED_FIELDS: OnboardingField[] = ['name', 'level'];
export const OPTIONAL_FIELDS: OnboardingField[] = ['age', 'grade'];

/**
 * 仅必填字段是否缺(name + level)。返回非空 → onboarding 未完成。
 * 上层 skill 用此判断是否走 LLM 短路路径。
 */
export function decideMissingRequired(p: ProfileDTO): OnboardingField[] {
  const missing: OnboardingField[] = [];
  if (!p.name) missing.push('name');
  if (!p.level) missing.push('level');
  return missing;
}

/**
 * 必填 + grade(可选但鼓励问)。仅供 buildSystemPrompt 措辞用,
 * 不影响 isOnboardingComplete 判断。
 */
export function decidePromptMissingFields(p: ProfileDTO): OnboardingField[] {
  const missing: OnboardingField[] = [];
  if (!p.name) missing.push('name');
  if (!p.level) missing.push('level');
  if (!p.grade) missing.push('grade');
  return missing;
}

export function buildSystemPrompt(
  profile: ProfileDTO,
  missing: OnboardingField[]
): string {
  const collected: string[] = [];
  if (profile.name) collected.push(`姓名: ${profile.name}`);
  if (profile.age != null) collected.push(`年龄: ${profile.age}`);
  if (profile.grade) collected.push(`年级: ${profile.grade}`);
  if (profile.level) collected.push(`英语水平: ${profile.level}`);

  const isFirst = collected.length === 0;
  const remainingDesc = missing.map((f) => FIELD_LABEL[f]).join(' / ');

  const lines: string[] = [
    '你是 Echora 的英语对话教练 Echo,正在通过对话采集新用户的画像。',
    '风格:温暖、简短、口语化中文,每轮回复 1-2 句话,不要寒暄过度,不要长段落。',
    '',
    '采集字段:',
    '- 姓名(必填,任意中英文称呼即可)',
    '- 英语水平(必填,映射到 CEFR A1/A2/B1/B2/C1/C2)',
    '- 年级(可选,如「高二」「大三」「在职」「无」均可;不强求)',
    '- 年龄(可选,用户主动说才记录)',
    '',
    '英语水平判定指南(用户用自然语言时由你映射到 CEFR):',
    '- 「初学/零基础/小学」→ A1',
    '- 「初中/CET3 以下」→ A2',
    '- 「高中/四级中等」→ B1',
    '- 「四级良好/六级中等/熟练」→ B2',
    '- 「六级优秀/雅思 7+/能流畅交流」→ C1',
    '- 「接近母语/留学多年」→ C2',
    '若用户表达模糊,先给 2-3 个 CEFR 级别让用户选,不要硬猜。',
    '',
    '工具使用规则:',
    '- 用户每次提供新信息后,**必须立即** 调用 `update_profile` 工具记录。',
    '- 一次工具调用可以包含多个字段(如用户一句话给了姓名+年级)。',
    '- 字段值必须是清洗后的标准形态(name 去掉「我叫」前缀,level 必须是 A1-C2 之一)。',
    '- 用户没明确给的字段不要瞎填。',
    '',
    '已收集信息:',
    collected.length > 0 ? collected.map((s) => '- ' + s).join('\n') : '(空)',
    '',
    `还需采集:${remainingDesc || '(已齐全,准备结束 onboarding)'}`,
    '',
    isFirst
      ? '这是 onboarding 第一轮:用一句话介绍自己,然后问对方怎么称呼。'
      : missing.length === 0
      ? '所有必填字段已齐全,简短确认一下采集到的信息,然后告诉用户准备进入场景推荐。'
      : `继续追问下一个缺失字段:${FIELD_LABEL[missing[0]]}。`,
  ];

  return lines.filter((l) => l !== undefined).join('\n');
}

const FIELD_LABEL: Record<OnboardingField, string> = {
  name: '姓名',
  age: '年龄',
  grade: '年级',
  level: '英语水平',
};

export const updateProfileTool: ToolDef = {
  name: 'update_profile',
  description:
    '记录用户在本轮对话中提供的画像信息。仅传入用户**确实提到**的字段,不要瞎填。' +
    '可以一次包含多个字段。level 必须是 CEFR(A1/A2/B1/B2/C1/C2)枚举值。',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '用户的称呼,去掉「我叫」「叫我」等前缀',
        minLength: 1,
        maxLength: 64,
      },
      age: {
        type: 'integer',
        description: '用户年龄',
        minimum: 1,
        maximum: 150,
      },
      grade: {
        type: 'string',
        description: '年级或在学/工作状态,自然语言原文',
        minLength: 1,
        maxLength: 64,
      },
      level: {
        type: 'string',
        enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        description: 'CEFR 等级,基于用户描述映射',
      },
    },
    additionalProperties: false,
  },
};
