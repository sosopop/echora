/**
 * practice skill 真实实现(MVP 阶段 1+2)
 *
 * 流程:
 *   1. 读 active scene_dialogue(无 → error)
 *   2. decideNextQuestion → 当前 stage / question_no
 *   3. 若 stage > MAX_STAGE_MVP → 整场 MVP 已通 → state-transition('awaiting_next')
 *   4. 出题:buildQuestionFromTurn + createAttempt 落 exercise_attempts
 *   5. yield text-chunk + mode-switch + widget-init(exercise-card) + widget-ready + state-transition('practicing') + done
 *
 * 不接 LLM:题目从结构化 scene_dialogue.turns 提取,确定性。
 * 这与 PRD §2.6 一致:出题是基于场景对话的「模板抽取」,不需要 LLM 重生成,
 * LLM 只在 scene 生成(scene-select 内)与 批改(grade 内)用。
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import { getActiveSceneDialogue } from '../services/sceneDialogue.js';
import { createAttempt } from '../services/exerciseAttempt.js';
import {
  decideNextQuestion,
  buildQuestionFromTurn,
  MAX_STAGE_MVP,
} from './_helpers/practiceFsm.js';

export const practiceSkill: Skill = {
  name: SKILL_NAMES.practice,
  description: '基于 scene_dialogue 按 4 阶段出题(MVP 阶段 1+2)',
  allowedStates: ['scene_selecting', 'practicing', 'awaiting_next'],
  primaryWidget: 'exercise-card',

  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const dialogue = getActiveSceneDialogue(ctx.db, ctx.conversationId);
    if (!dialogue) {
      yield {
        type: 'error',
        payload: {
          code: 'NO_ACTIVE_SCENE',
          message: '当前会话没有活跃场景对话,请先选择场景。',
        },
      };
      return;
    }

    const next = decideNextQuestion(ctx.db, ctx.conversationId);

    // 整场已通过 MVP 阶段 → 转 awaiting_next
    if (next.stage > MAX_STAGE_MVP) {
      yield {
        type: 'text-chunk',
        payload: {
          text:
            `本场景阶段 1-2 已完成。后续阶段(对话接龙、角色互换)在下一版本开放。`,
        },
      };
      yield {
        type: 'state-transition',
        payload: { nextLearningState: 'awaiting_next', activeSkill: null },
      };
      yield { type: 'done', payload: {} };
      return;
    }

    // 取出本题模板
    const q = buildQuestionFromTurn(dialogue, next.stage, next.questionNo);
    if (!q) {
      yield {
        type: 'error',
        payload: {
          code: 'NO_QUESTION_TEMPLATE',
          message: `场景对话内容不足以出阶段 ${next.stage} 第 ${next.questionNo} 题`,
        },
      };
      return;
    }

    // 落 attempt
    const attempt = createAttempt(ctx.db, {
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      sceneId: dialogue.sceneId,
      stage: next.stage,
      questionNo: next.questionNo,
      questionType: q.questionType,
      prompt: q.prompt,
    });

    // 输出
    yield {
      type: 'text-chunk',
      payload: { text: `阶段 ${next.stage} · 第 ${next.questionNo} 题` },
    };
    yield {
      type: 'mode-switch',
      payload: { mode: q.display.inputMode },
    };
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
            stage: next.stage,
            questionNo: next.questionNo,
            questionType: q.questionType,
            prompt: q.prompt,
            contextZh: q.display.contextZh,
            contextEn: q.display.contextEn,
            hint: q.display.hint,
            inputMode: q.display.inputMode,
          },
        },
      },
    };
    yield {
      type: 'state-transition',
      payload: { nextLearningState: 'practicing', activeSkill: 'practice' },
    };
    yield { type: 'done', payload: {} };
  },
};
