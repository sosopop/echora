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
 *   8. 对答/相近 → 阶段完成判断并自动串接下一题:
 *      - 阶段 1-4 全部动态 stageGoal 满足 → state-transition('awaiting_next')
 *      - 否则继续调用 practice/retry 出下一题,不需要用户点击
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
import {
  MAX_STAGE_MVP,
  buildQuestionFromTurn,
} from './_helpers/practiceFsm.js';
import {
  getStageGoalFromPlan,
  getStageGoalPlan,
} from '../services/stageGoal.js';
import { recordGradingLearningSignals } from '../services/learningSignals.js';
import { maybeAdjustDifficultyAfterSceneCompletion } from '../services/difficultyAdaptation.js';
import { practiceSkill } from './practice.js';
import { retrySkill } from './retry.js';
import { decodeAttemptPrompt } from '../services/attemptPrompt.js';
import type { GradingCategory } from './_helpers/gradeFsm.js';

const RETRY_STAGE = 5;
const RETRY_GOAL = 3;

function countRetryAttempts(
  ctx: ServerSkillContext,
  sceneId: string | null
): number {
  const rows = ctx.db
    .prepare<[number, number, string | null], { prompt: string }>(
      `SELECT prompt
       FROM exercise_attempts
       WHERE conversation_id = ?
         AND stage = ?
         AND scene_id IS ?`
    )
    .all(ctx.conversationId, RETRY_STAGE, sceneId);
  return rows.filter(
    (row) => decodeAttemptPrompt(row.prompt).kind !== 'replacement'
  ).length;
}

function categoryLabel(category: GradingCategory): string {
  switch (category) {
    case 'exact':
      return '完全正确';
    case 'similar':
      return '还不错';
    case 'incorrect':
      return '错误';
  }
}

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
    const stageGoalPlan = getStageGoalPlan(dialogue?.difficulty);
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
        ctx.signal,
        stageGoalPlan,
        ctx.logDebug,
        {
          traceId: ctx.traceId,
          userId: ctx.user.id,
          conversationId: ctx.conversationId,
          messageId: ctx.messageId,
          streamId: ctx.streamId,
          runId: ctx.runId,
          skillName: SKILL_NAMES.grade,
          learningState: ctx.learningState,
          phase: 'grade',
        }
      );
    } catch (e) {
      if (ctx.signal.aborted || isAbortError(e)) {
        return;
      }
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
    const grading = createGrading(ctx.db, {
      attemptId,
      score: result.score,
      isCorrect: result.isCorrect,
      corrections: result.corrections,
    });
    recordGradingLearningSignals(ctx.db, {
      userId: ctx.user.id,
      attempt,
      grading,
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
            category: result.category,
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
        if (attempt.stage !== RETRY_STAGE) {
          const targetTag =
            result.corrections.tags?.[0] ?? attempt.questionType;
          yield {
            type: 'text-chunk',
            payload: {
              text: '本题已达 2 次重试,我换一道更简单的同类题带你过一下。',
            },
          };
          for await (const ev of retrySkill.handler({
            ...ctx,
            learningState: 'practicing',
            params: {
              mode: 'replacement',
              sourceAttemptId: attemptId,
              targetTag,
            },
          })) {
            yield ev;
          }
          return;
        }
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

    yield {
      type: 'text-chunk',
      payload: { text: `${categoryLabel(result.category)}。` },
    };

    // 重练专项题通过 → 不推进 4 阶段主线,由 retry skill 继续出下一题
    if (attempt.stage === RETRY_STAGE) {
      const retryPrompt = decodeAttemptPrompt(attempt.prompt);
      if (retryPrompt.kind === 'replacement') {
        yield {
          type: 'text-chunk',
          payload: { text: '替换题通过了,回到主线继续。' },
        };
        for await (const ev of practiceSkill.handler({
          ...ctx,
          learningState: 'practicing',
          params: {},
        })) {
          yield ev;
        }
        return;
      }
      const retryCount = countRetryAttempts(ctx, attempt.sceneId);
      if (retryCount >= RETRY_GOAL) {
        yield {
          type: 'text-chunk',
          payload: {
            text: '这组专项重练完成了。发送"复盘"可以查看更新后的总结。',
          },
        };
        yield {
          type: 'state-transition',
          payload: { nextLearningState: 'reviewing', activeSkill: 'review' },
        };
      } else {
        yield {
          type: 'text-chunk',
          payload: { text: '专项题答对了,继续下一题。' },
        };
        for await (const ev of retrySkill.handler({
          ...ctx,
          learningState: 'practicing',
          params: {
            targetTag: retryPrompt.targetTag,
          },
        })) {
          yield ev;
        }
      }
      return;
    }

    // 本题通过 → 检查阶段是否完成
    const passedInStage = countStagePassed(
      ctx.db,
      ctx.conversationId,
      attempt.stage,
      attempt.sceneId
    );
    const stageGoal = getStageGoalFromPlan(stageGoalPlan, attempt.stage);
    const stageComplete = passedInStage >= stageGoal;
    if (attempt.stage === 4) {
      const followUp = dialogue
        ? buildQuestionFromTurn(
            dialogue,
            attempt.stage,
            attempt.questionNo,
            stageGoalPlan
          )
            ?.followUpResponse
        : null;
      if (followUp) {
        yield {
          type: 'text-chunk',
          payload: {
            text:
              `如果继续这段对话,${followUp.role} 可能会回应: ` +
              `${followUp.en}（${followUp.zh}）`,
          },
        };
      }
    }

    if (stageComplete && attempt.stage >= MAX_STAGE_MVP) {
      const autoDifficulty = maybeAdjustDifficultyAfterSceneCompletion(
        ctx.db,
        ctx.user.id
      );
      // 整场 4 阶段完成
      yield {
        type: 'text-chunk',
        payload: { text: '本场景 4 个阶段练习完成!' },
      };
      if (autoDifficulty) {
        yield {
          type: 'text-chunk',
          payload: {
            text: formatAutomaticDifficultyText(autoDifficulty),
          },
        };
      }
      yield {
        type: 'state-transition',
        payload: { nextLearningState: 'awaiting_next', activeSkill: null },
      };
    } else if (stageComplete) {
      yield {
        type: 'text-chunk',
        payload: { text: `阶段 ${attempt.stage} 完成,进入下一阶段。` },
      };
      for await (const ev of practiceSkill.handler({
        ...ctx,
        learningState: 'practicing',
        params: {},
      })) {
        yield ev;
      }
      return;
    } else {
      for await (const ev of practiceSkill.handler({
        ...ctx,
        learningState: 'practicing',
        params: {},
      })) {
        yield ev;
      }
      return;
    }

    yield { type: 'done', payload: {} };
  },
};

function formatAutomaticDifficultyText(input: {
  reason: 'two_scene_first_pass' | 'two_scene_early_struggle';
  adjustment: {
    previousLevel: string;
    nextLevel: string;
    changed: boolean;
  };
}): string {
  if (!input.adjustment.changed) {
    return input.reason === 'two_scene_first_pass'
      ? `你已经连续两个场景一次通过,但当前已经是 ${input.adjustment.previousLevel} 最高档附近,我会继续保持挑战。`
      : `你连续两个场景前半段有点吃力,但当前已经是 ${input.adjustment.previousLevel} 最低档附近,我会继续用更慢的节奏带你练。`;
  }
  if (input.reason === 'two_scene_first_pass') {
    return `你连续两个场景都很顺,我已把后续难度从 ${input.adjustment.previousLevel} 提高到 ${input.adjustment.nextLevel}。`;
  }
  return `你连续两个场景前半段有点吃力,我已把后续难度从 ${input.adjustment.previousLevel} 降低到 ${input.adjustment.nextLevel}。`;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
