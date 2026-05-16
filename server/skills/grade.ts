/**
 * grade skill 真实实现
 *
 * 流程:
 *   1. 从 ctx.params.action 拿 submit-answer { attemptId, answer }
 *   2. 查 attempt + scene_dialogue 上下文
 *   3. 防御:已 graded 且 retry_count>=2 → error ATTEMPT_LOCKED
 *   4. markSubmitted(attempt, answer)
 *   5. runGrading → LLM tool='grade_answer' → 落 grading_results + markGraded
 *   6. yield text-chunk + widget-init/ready(grading-result)
 *   7. 错答 → incrementRetry,若达 2 次 → markNeedsReview;保持 practicing
 *   8. 对答 → 阶段完成判断:
 *      - 阶段 1+2 全部 STAGE_GOAL 满足 → state-transition('awaiting_next')
 *      - 否则保持 practicing,前端发 next-question 拿下一题
 */

import type { Skill, SkillEventInput } from '../../shared/skill.js';
import { SKILL_NAMES } from '../../shared/skill.js';
import type { ServerSkillContext } from './types.js';
import type { ChatAction } from '../../shared/api.js';
import { getActiveSceneDialogue } from '../services/sceneDialogue.js';
import {
  getAttempt,
  markSubmitted,
  markGraded,
  incrementRetry,
  markNeedsReview,
  countStagePassed,
} from '../services/exerciseAttempt.js';
import { createGrading } from '../services/gradingResult.js';
import { runGrading } from './_helpers/gradeFsm.js';
import { STAGE_GOAL, MAX_STAGE_MVP } from './_helpers/practiceFsm.js';

export const gradeSkill: Skill = {
  name: SKILL_NAMES.grade,
  description: '批改用户答案 → 落 grading_results → 推进阶段进度',
  allowedStates: ['practicing', 'grading'],
  primaryWidget: 'grading-result',

  async *handler(_ctx): AsyncIterable<SkillEventInput> {
    const ctx = _ctx as ServerSkillContext;
    const action = ctx.params.action as ChatAction | undefined;
    if (!action || action.type !== 'submit-answer') {
      yield {
        type: 'error',
        payload: {
          code: 'GRADE_NO_ANSWER',
          message: 'grade skill 需要 submit-answer action',
        },
      };
      return;
    }
    const { attemptId, answer } = action.payload;
    const attempt = getAttempt(ctx.db, attemptId);
    if (!attempt) {
      yield {
        type: 'error',
        payload: {
          code: 'ATTEMPT_NOT_FOUND',
          message: `attempt ${attemptId} 不存在`,
        },
      };
      return;
    }
    if (attempt.conversationId !== ctx.conversationId) {
      yield {
        type: 'error',
        payload: {
          code: 'ATTEMPT_NOT_FOUND',
          message: `attempt ${attemptId} 不属于当前会话`,
        },
      };
      return;
    }
    // 锁定:已 graded + 已达 2 次重试
    if (attempt.status === 'graded' && attempt.retryCount >= 2) {
      yield {
        type: 'error',
        payload: {
          code: 'ATTEMPT_LOCKED',
          message: '该题已达最大重试次数,无法再提交',
        },
      };
      return;
    }
    if (attempt.status === 'needs_review') {
      yield {
        type: 'error',
        payload: {
          code: 'ATTEMPT_LOCKED',
          message: '该题已标记为需要复盘,无法再次提交',
        },
      };
      return;
    }

    // 标提交
    markSubmitted(ctx.db, attemptId, answer);

    // 调 LLM 批改
    const dialogue = getActiveSceneDialogue(ctx.db, ctx.conversationId);
    yield { type: 'text-chunk', payload: { text: '正在批改…' } };
    const widgetId = ctx.makeWidgetId('grading-result');
    yield {
      type: 'widget-init',
      payload: {
        widget: {
          id: widgetId,
          type: 'grading-result',
          status: 'loading',
          data: {},
          version: 1,
        },
      },
    };

    let result;
    try {
      result = await runGrading(
        ctx.provider,
        attempt,
        dialogue,
        answer,
        ctx.signal
      );
    } catch (e) {
      yield {
        type: 'error',
        payload: {
          code: 'GRADE_FAILED',
          message: e instanceof Error ? e.message : String(e),
        },
      };
      return;
    }

    // 落库
    createGrading(ctx.db, {
      attemptId,
      score: result.score,
      isCorrect: result.isCorrect,
      corrections: result.corrections,
    });
    markGraded(ctx.db, attemptId);

    // widget
    yield {
      type: 'widget-ready',
      payload: {
        widgetId,
        patch: {
          status: 'ready',
          data: {
            attemptId,
            score: result.score,
            isCorrect: result.isCorrect,
            userAnswer: answer,
            referenceAnswer: result.corrections.referenceAnswer,
            explanation: result.corrections.explanation,
            tags: result.corrections.tags ?? [],
          },
        },
      },
    };

    // 阶段进度判断
    if (!result.isCorrect) {
      const newRetry = incrementRetry(ctx.db, attemptId);
      if (newRetry >= 2) {
        markNeedsReview(ctx.db, attemptId);
        yield {
          type: 'text-chunk',
          payload: { text: '本题已达 2 次重试,跳过并标记复盘。' },
        };
      } else {
        yield {
          type: 'text-chunk',
          payload: { text: '可以再试一次,或发送下一题。' },
        };
      }
      // 保持 practicing
      yield { type: 'done', payload: {} };
      return;
    }

    // 本题通过 → 检查阶段是否完成
    const passedInStage = countStagePassed(
      ctx.db,
      ctx.conversationId,
      attempt.stage
    );
    const stageComplete = passedInStage >= STAGE_GOAL;
    if (stageComplete && attempt.stage >= MAX_STAGE_MVP) {
      // 整场 MVP 完成
      yield {
        type: 'text-chunk',
        payload: { text: '🎉 本场景练习完成!' },
      };
      yield {
        type: 'state-transition',
        payload: { nextLearningState: 'awaiting_next', activeSkill: null },
      };
    } else if (stageComplete) {
      yield {
        type: 'text-chunk',
        payload: { text: `阶段 ${attempt.stage} 完成,可以进入下一阶段。` },
      };
      // 保持 practicing,前端发 next-question 触发 practice skill 出下一题
    } else {
      yield {
        type: 'text-chunk',
        payload: { text: '答得不错,继续下一题。' },
      };
    }

    yield { type: 'done', payload: {} };
  },
};
