/**
 * explain Skill — 基于最近题目/批改做深入解析。
 *
 * 当前先落主消息流的最小闭环:不创建右侧 branch_thread,但严格遵守
 * "未提交前只给提示,不泄露标准答案"。
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import type { GradingCorrections } from '../services/gradingResult.js';
import { decodeAttemptPrompt } from '../services/attemptPrompt.js';

interface ExplainAttemptRow {
  attempt_id: number;
  stage: number;
  question_no: number;
  question_type: string;
  prompt: string;
  user_answer: string | null;
  status: string;
  score: number | null;
  is_correct: number | null;
  corrections: string | null;
}

const TAG_HINTS: Record<string, string> = {
  spelling: '拼写问题优先逐词对照,尤其注意结尾字母和双写。',
  word_order: '英语语序通常先放主语和谓语,修饰信息再跟上。',
  tense: '时态要和时间线一致,先判断这句话是在说现在、过去还是将来。',
  preposition: '介词常和场景搭配绑定,不要逐字翻译中文里的介词。',
  article: '可数单数名词前通常需要 a/an/the 这类限定词。',
  subject_verb_agreement: '主谓一致要看主语是单数还是复数,再决定动词形式。',
  auxiliary_verb: '疑问句和否定句常需要助动词帮忙表达时态或语气。',
  collocation: '固定搭配要整体记,不要只按单词逐个拼。',
  politeness: '请求别人帮忙时,用 would/could/please 会更自然。',
  literal_translation: '这类句子不要贴中文词序翻,先想英语里更常见的表达方式。',
  missing_word: '缺词时先看句子骨架是否完整:主语、动词、宾语或小品词是否缺位。',
  extra_word: '多词通常来自重复表达;删掉不承担语法功能的词会更清爽。',
};

export const explainSkill: Skill = {
  name: SKILL_NAMES.explain,
  description: '针对最近题目/批改结果做深入解析',
  allowedStates: [
    'practicing',
    'grading',
    'awaiting_next',
    'reviewing',
    'scene_selecting',
  ],
  primaryWidget: 'follow-up-source',

  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const row = getLatestExplainAttempt(ctx);
    if (!row) {
      yield {
        type: 'text-chunk',
        payload: {
          text:
            '我现在还没有找到可解释的题目或批改记录。你可以先完成一道题,再问我“为什么错”或“怎么改”。',
        },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    const widgetId = ctx.makeWidgetId('follow-up-source');
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'follow-up-source',
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
          data: buildSourceData(row),
        },
      },
    };

    yield {
      type: 'text-chunk',
      payload: {
        text:
          row.score == null
            ? buildPendingHint(row)
            : buildGradingExplanation(row),
      },
    };
    yield { type: 'done', payload: {} };
  },
};

function getLatestExplainAttempt(
  ctx: ServerSkillContext
): ExplainAttemptRow | null {
  const row = ctx.db
    .prepare<[number], ExplainAttemptRow>(
      `SELECT a.id AS attempt_id,
              a.stage,
              a.question_no,
              a.question_type,
              a.prompt,
              a.user_answer,
              a.status,
              g.score,
              g.is_correct,
              g.corrections
       FROM exercise_attempts a
       LEFT JOIN grading_results g ON g.attempt_id = a.id
       WHERE a.conversation_id = ?
       ORDER BY COALESCE(g.created_at, a.submitted_at, a.created_at) DESC,
                a.id DESC
       LIMIT 1`
    )
    .get(ctx.conversationId);
  return row ?? null;
}

function buildSourceData(row: ExplainAttemptRow): Record<string, unknown> {
  const sourceKind = row.score == null ? 'exercise' : 'grading';
  const label =
    row.score == null ? '来自:当前题目' : `来自:最近一次批改 · ${row.score} 分`;
  return {
    sourceKind,
    sourceLabel: label,
    snippet:
      `阶段 ${row.stage} · 第 ${row.question_no} 题 · ` +
      `${labelForQuestionType(row.question_type)}\n` +
      compactPrompt(decodeAttemptPrompt(row.prompt).prompt, 90),
    canMarkForReview: row.score != null,
  };
}

function buildPendingHint(row: ExplainAttemptRow): string {
  const prompt = decodeAttemptPrompt(row.prompt).prompt;
  const typeHint = hintForQuestionType(row.question_type);
  return [
    '这题还没提交,我只给提示,不直接给标准答案。',
    typeHint,
    `你可以先盯住这句: ${compactPrompt(prompt, 120)}`,
  ].join('\n');
}

function buildGradingExplanation(row: ExplainAttemptRow): string {
  const corrections = safeParseCorrections(row.corrections);
  const tags = corrections.tags ?? [];
  const parts = ['我按最近一次批改来讲。'];

  if (row.user_answer) {
    parts.push(`你的回答: ${row.user_answer}`);
  }
  if (corrections.referenceAnswer) {
    parts.push(`更稳的表达: ${corrections.referenceAnswer}`);
  }
  if (corrections.explanation) {
    parts.push(`批改重点: ${corrections.explanation}`);
  }
  if (tags.length > 0) {
    parts.push(
      `这次主要看 ${tags.join(' / ')}: ` +
        tags.map((tag) => TAG_HINTS[tag] ?? `${tag} 需要结合句子再看。`).join(' ')
    );
  } else if (row.is_correct === 1) {
    parts.push('这题已经达标;如果想更自然,可以继续比较语气、搭配和简洁度。');
  }
  parts.push('你可以直接继续追问某个词、介词或整句为什么这样说。');
  return parts.join('\n');
}

function safeParseCorrections(v: string | null): GradingCorrections {
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as GradingCorrections)
      : {};
  } catch {
    return {};
  }
}

function labelForQuestionType(questionType: string): string {
  switch (questionType) {
    case 'fill_word':
      return '单词填空';
    case 'sentence_translation':
      return '整句翻译';
    case 'dialogue_chain':
      return '对话接龙';
    case 'role_reversal':
      return '角色互换';
    default:
      return '练习题';
  }
}

function hintForQuestionType(questionType: string): string {
  switch (questionType) {
    case 'fill_word':
      return '先判断空格处需要什么词性,再看空格前后的固定搭配。';
    case 'sentence_translation':
      return '先搭出主语和谓语,再补宾语、时间地点和礼貌语气。';
    case 'dialogue_chain':
      return '先看上一句在问什么或表达什么态度,你的回复要接住它。';
    case 'role_reversal':
      return '先确认你现在扮演的角色,再主动说出这个角色最自然会说的话。';
    default:
      return '先抓住句子的核心意思,再补语法细节。';
  }
}

function compactPrompt(prompt: string, max: number): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
}
