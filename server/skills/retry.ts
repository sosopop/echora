/**
 * retry Skill — 基于结构化薄弱点生成降难专项题
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import { getActiveSceneDialogue } from '../services/sceneDialogue.js';
import { createAttempt } from '../services/exerciseAttempt.js';
import { listErrorTagSummaryByConversation } from '../services/errorTagEvent.js';
import { listMasteryRecords } from '../services/masteryRecord.js';
import {
  decodeAttemptPrompt,
  encodeRetryAttemptPrompt,
} from '../services/attemptPrompt.js';

export const RETRY_STAGE = 5;
const RETRY_GOAL = 3;

interface RetryQuestionTemplate {
  questionType: 'fill_word' | 'sentence_translation';
  prompt: string;
  contextZh: string;
  contextEn?: string;
  hint?: string;
  inputMode: 'fill' | 'chat';
  referenceAnswer: string;
}

function listRetryAttemptPrompts(
  ctx: ServerSkillContext,
  sceneId: string
): string[] {
  return ctx.db
    .prepare<[number, string, number], { prompt: string }>(
      `SELECT prompt
       FROM exercise_attempts
       WHERE conversation_id = ?
         AND scene_id = ?
         AND stage = ?`
    )
    .all(ctx.conversationId, sceneId, RETRY_STAGE)
    .map((row) => row.prompt);
}

function countRetryAttempts(ctx: ServerSkillContext, sceneId: string): number {
  return listRetryAttemptPrompts(ctx, sceneId).filter(
    (prompt) => decodeAttemptPrompt(prompt).kind !== 'replacement'
  ).length;
}

function countAllRemediationAttempts(
  ctx: ServerSkillContext,
  sceneId: string
): number {
  return listRetryAttemptPrompts(ctx, sceneId).length;
}

function pickTargetTag(
  ctx: ServerSkillContext,
  sceneId: string
): string | null {
  const fromParam =
    typeof ctx.params.targetTag === 'string'
      ? ctx.params.targetTag.trim()
      : '';
  if (fromParam) return fromParam;
  const tagSummary = listErrorTagSummaryByConversation(
    ctx.db,
    ctx.conversationId,
    sceneId
  );
  if (tagSummary[0]?.tag) return tagSummary[0].tag;
  const weakMastery = listMasteryRecords(ctx.db, ctx.user.id, 20)
    .filter((row) => row.masteryScore < 80)
    .sort((a, b) => a.masteryScore - b.masteryScore)[0];
  return weakMastery?.tag ?? null;
}

function articleTemplate(questionNo: number): RetryQuestionTemplate {
  const variants = [
    {
      contextZh: '降难重练:补上表示"一杯咖啡"的小词。',
      contextEn: 'I would like ______ coffee.',
      referenceAnswer: 'a',
      hint: '一个字母,表示一个/一杯',
    },
    {
      contextZh: '降难重练:补上表示"一张桌子"的小词。',
      contextEn: 'I need ______ table.',
      referenceAnswer: 'a',
      hint: '首字母:a',
    },
    {
      contextZh: '降难重练:补上表示特指账单的小词。',
      contextEn: 'Can I have ______ bill?',
      referenceAnswer: 'the',
      hint: '表示特指',
    },
  ];
  const v = variants[(questionNo - 1) % variants.length];
  return {
    questionType: 'fill_word',
    prompt: `Fill the blank: "${v.contextEn}"`,
    inputMode: 'fill',
    ...v,
  };
}

function prepositionTemplate(questionNo: number): RetryQuestionTemplate {
  const variants = [
    {
      contextZh: '降难重练:补上"在咖啡店里"常用介词。',
      contextEn: 'I am ______ the cafe.',
      referenceAnswer: 'in',
      hint: '表示在里面',
    },
    {
      contextZh: '降难重练:补上"在桌上"常用介词。',
      contextEn: 'The menu is ______ the table.',
      referenceAnswer: 'on',
      hint: '表示在表面上',
    },
    {
      contextZh: '降难重练:补上"在三点"常用介词。',
      contextEn: 'We meet ______ three.',
      referenceAnswer: 'at',
      hint: '时间点前常用',
    },
  ];
  const v = variants[(questionNo - 1) % variants.length];
  return {
    questionType: 'fill_word',
    prompt: `Fill the blank: "${v.contextEn}"`,
    inputMode: 'fill',
    ...v,
  };
}

function wordOrderTemplate(questionNo: number): RetryQuestionTemplate {
  const variants = [
    {
      contextZh: '降难重练:请把"你可以帮我吗?"说成自然英文。',
      referenceAnswer: 'Could you help me?',
      hint: 'Could you ...?',
    },
    {
      contextZh: '降难重练:请把"我想要一杯水"说成自然英文。',
      referenceAnswer: 'I would like a glass of water.',
      hint: 'I would like ...',
    },
    {
      contextZh: '降难重练:请把"车站在哪里?"说成自然英文。',
      referenceAnswer: 'Where is the station?',
      hint: 'Where is ...?',
    },
  ];
  const v = variants[(questionNo - 1) % variants.length];
  return {
    questionType: 'sentence_translation',
    prompt: `Translate to English: "${v.contextZh}"`,
    contextZh: v.contextZh,
    hint: v.hint,
    inputMode: 'chat',
    referenceAnswer: v.referenceAnswer,
  };
}

function missingWordTemplate(questionNo: number): RetryQuestionTemplate {
  const variants = [
    {
      contextZh: '降难重练:want 后面接动词时,中间常要补哪个小词?',
      contextEn: 'I want ______ order soup.',
      referenceAnswer: 'to',
      hint: '两个字母',
    },
    {
      contextZh: '降难重练:请补上"想要"里的关键动词。',
      contextEn: 'I would ______ a coffee.',
      referenceAnswer: 'like',
      hint: '首字母:l',
    },
    {
      contextZh: '降难重练:请补上礼貌请求里的小词。',
      contextEn: 'Could I ______ the menu?',
      referenceAnswer: 'have',
      hint: '表示拿到/拥有',
    },
  ];
  const v = variants[(questionNo - 1) % variants.length];
  return {
    questionType: 'fill_word',
    prompt: `Fill the blank: "${v.contextEn}"`,
    inputMode: 'fill',
    ...v,
  };
}

function tenseTemplate(questionNo: number): RetryQuestionTemplate {
  const variants = [
    {
      contextZh: '降难重练:昨天发生的动作,请用过去式。',
      contextEn: 'Yesterday, I ______ coffee.',
      referenceAnswer: 'ordered',
      hint: 'order 的过去式',
    },
    {
      contextZh: '降难重练:昨天去了商店,请用过去式。',
      contextEn: 'Yesterday, I ______ to the shop.',
      referenceAnswer: 'went',
      hint: 'go 的过去式',
    },
    {
      contextZh: '降难重练:现在正在等,请补 be 动词。',
      contextEn: 'I ______ waiting now.',
      referenceAnswer: 'am',
      hint: 'I 后面的 be 动词',
    },
  ];
  const v = variants[(questionNo - 1) % variants.length];
  return {
    questionType: 'fill_word',
    prompt: `Fill the blank: "${v.contextEn}"`,
    inputMode: 'fill',
    ...v,
  };
}

function defaultTemplate(questionNo: number): RetryQuestionTemplate {
  const variants = [
    {
      contextZh: '降难重练:请补上点单时最常用的礼貌动词。',
      contextEn: 'I would ______ a coffee.',
      referenceAnswer: 'like',
      hint: '首字母:l',
    },
    {
      contextZh: '降难重练:请补上感谢表达。',
      contextEn: '______ you.',
      referenceAnswer: 'Thank',
      hint: '表示谢谢',
    },
    {
      contextZh: '降难重练:请补上"请"。',
      contextEn: 'A coffee, ______.',
      referenceAnswer: 'please',
      hint: '礼貌用语',
    },
  ];
  const v = variants[(questionNo - 1) % variants.length];
  return {
    questionType: 'fill_word',
    prompt: `Fill the blank: "${v.contextEn}"`,
    inputMode: 'fill',
    ...v,
  };
}

function buildRetryQuestion(
  targetTag: string,
  questionNo: number
): RetryQuestionTemplate {
  switch (targetTag) {
    case 'article':
      return articleTemplate(questionNo);
    case 'preposition':
      return prepositionTemplate(questionNo);
    case 'word_order':
    case 'literal_translation':
      return wordOrderTemplate(questionNo);
    case 'missing_word':
    case 'auxiliary_verb':
    case 'collocation':
      return missingWordTemplate(questionNo);
    case 'tense':
    case 'subject_verb_agreement':
      return tenseTemplate(questionNo);
    default:
      return defaultTemplate(questionNo);
  }
}

export const retrySkill: Skill = {
  name: SKILL_NAMES.retry,
  description: '基于历史薄弱点生成降难专项题',
  allowedStates: ['awaiting_next', 'reviewing', 'scene_selecting', 'practicing'],
  primaryWidget: 'exercise-card',
  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const isReplacement = ctx.params.mode === 'replacement';
    const dialogue = getActiveSceneDialogue(ctx.db, ctx.conversationId);
    if (!dialogue) {
      yield {
        type: 'error',
        payload: {
          code: 'NO_ACTIVE_SCENE',
          message: '还没有可用于重练的场景。请先选择一个场景完成练习。',
        },
      };
      return;
    }

    const targetTag = pickTargetTag(ctx, dialogue.sceneId);
    if (!targetTag) {
      yield {
        type: 'text-chunk',
        payload: {
          text: '目前还没有明显薄弱点。可以先换一个场景继续练习,积累更多批改记录后再重练。',
        },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    const doneCount = countRetryAttempts(ctx, dialogue.sceneId);
    if (!isReplacement && doneCount >= RETRY_GOAL) {
      yield {
        type: 'text-chunk',
        payload: {
          text: `本轮 ${targetTag} 专项重练已完成。你可以发送"复盘"查看更新后的总结,或换场景继续。`,
        },
      };
      yield {
        type: 'state-transition',
        payload: { nextLearningState: 'reviewing', activeSkill: 'review' },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    const questionNo = isReplacement
      ? countAllRemediationAttempts(ctx, dialogue.sceneId) + 1
      : doneCount + 1;
    const q = buildRetryQuestion(targetTag, questionNo);
    const attempt = createAttempt(ctx.db, {
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      sceneId: dialogue.sceneId,
      stage: RETRY_STAGE,
      questionNo,
      questionType: q.questionType,
      prompt: encodeRetryAttemptPrompt({
        prompt: q.prompt,
        referenceAnswer: q.referenceAnswer,
        targetTag,
        kind: isReplacement ? 'replacement' : 'retry',
        sourceAttemptId:
          typeof ctx.params.sourceAttemptId === 'number'
            ? ctx.params.sourceAttemptId
            : undefined,
      }),
    });

    yield {
      type: 'text-chunk',
      payload: {
        text: isReplacement
          ? `降难替换题:${targetTag}`
          : `重练专场:${targetTag} · 第 ${questionNo}/${RETRY_GOAL} 题`,
      },
    };
    yield { type: 'mode-switch', payload: { mode: q.inputMode } };
    const widgetId = ctx.makeWidgetId('exercise-card');
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'exercise-card',
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
            attemptId: attempt.id,
            stage: RETRY_STAGE,
            questionNo,
            stageGoal: isReplacement ? 1 : RETRY_GOAL,
            questionType: q.questionType,
            remediationKind: isReplacement ? 'replacement' : 'retry',
            prompt: q.prompt,
            contextZh: q.contextZh,
            contextEn: q.contextEn,
            hint: q.hint,
            inputMode: q.inputMode,
          },
        },
      },
    };
    yield {
      type: 'state-transition',
      payload: {
        nextLearningState: 'practicing',
        activeSkill: isReplacement ? 'practice' : 'retry',
      },
    };
    yield { type: 'done', payload: {} };
  },
};
