/**
 * 12 Widget zod schema + LearningWidget 协议
 *
 * 此文件由前后端共享。仅依赖 zod。
 *
 * Widget 清单(PRD §4.7):
 *   1. scene-cards         场景推荐卡片组
 *   2. exercise-card       练习题主卡片
 *   3. fill-blank          填空输入区域
 *   4. choice-question     选择题按钮组
 *   5. grading-result      批改结果卡片
 *   6. progress-summary    学习进度摘要
 *   7. answer-review       单题回看卡片
 *   8. intent-confirm      低置信度意图确认
 *   9. learning-menu       输入框左侧学习菜单
 *  10. account-gate        登录/注册/保存进度
 *  11. follow-up-source    辅助追问来源提示
 *  12. conversation-lock   历史答案锁定提示
 */

import { z } from 'zod';

/* ============================================================
 * Widget 状态(生命周期)
 * ========================================================== */
export const WidgetStatusSchema = z.enum([
  'loading',
  'ready',
  'disabled',
  'submitted',
  'expired',
  'error',
]);
export type WidgetStatus = z.infer<typeof WidgetStatusSchema>;

/* ============================================================
 * 公共 envelope
 * ========================================================== */
const widgetBase = {
  id: z.string().min(1),
  status: WidgetStatusSchema,
  version: z.number().int().nonnegative(),
};

/* ============================================================
 * 1. scene-cards
 * ========================================================== */
export const SceneCardSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  description: z.string(),
  knowledgePoint: z.string(),
  difficulty: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
});

export const SceneCardsWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('scene-cards'),
  data: z.object({
    cards: z.array(SceneCardSchema).min(1).max(5),
    allowCustom: z.boolean().default(true),
  }),
});

/* ============================================================
 * 2. exercise-card
 * ========================================================== */
export const QuestionTypeSchema = z.enum([
  'fill_word',
  'sentence_translation',
  'dialogue_chain',
  'role_reversal',
  'fill_phrase',
  'half_translate',
  'full_translate',
  'dialogue',
  'select',
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const ExerciseCardWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('exercise-card'),
  data: z.object({
    questionId: z.string().optional(),
    attemptId: z.number().int().positive().optional(),
    stage: z.number().int().positive().optional(),
    totalStages: z.number().int().positive().optional(),
    questionNo: z.number().int().positive().optional(),
    stageGoal: z.number().int().positive().optional(),
    questionType: QuestionTypeSchema,
    prompt: z.string().optional(),
    context: z.string().optional(),
    contextZh: z.string().optional(),
    contextEn: z.string().optional(),
    targetZh: z.string().optional(),
    remediationKind: z.enum(['retry', 'replacement']).optional(),
    hint: z.string().optional(),
    inputMode: z.enum(['chat', 'fill', 'select']),
  }),
});

/* ============================================================
 * 3. fill-blank
 * ========================================================== */
export const FillBlankSchema = z.object({
  index: z.number().int().nonnegative(),
  hint: z.string().optional(),
  expected: z.string().optional(), // 仅服务端持有,前端 schema 解析时可能不传
});

export const FillBlankWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('fill-blank'),
  data: z.object({
    template: z.string(), // 含 ___ 占位的模板句
    blanks: z.array(FillBlankSchema).min(1),
    answers: z.array(z.string()).optional(), // 用户已填
  }),
});

/* ============================================================
 * 4. choice-question
 * ========================================================== */
export const ChoiceOptionSchema = z.object({
  key: z.string(), // A / B / C / D
  text: z.string(),
});

export const ChoiceQuestionWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('choice-question'),
  data: z.object({
    prompt: z.string(),
    options: z.array(ChoiceOptionSchema).min(2).max(6),
    selectedKey: z.string().optional(),
    correctKey: z.string().optional(), // 提交后才发
  }),
});

/* ============================================================
 * 5. grading-result
 * ========================================================== */
export const ErrorTagSchema = z.enum([
  'spelling',
  'word_order',
  'tense',
  'preposition',
  'article',
  'subject_verb_agreement',
  'auxiliary_verb',
  'collocation',
  'politeness',
  'literal_translation',
  'missing_word',
  'extra_word',
]);
export type ErrorTag = z.infer<typeof ErrorTagSchema>;

export const GradingCategorySchema = z.enum([
  'exact',
  'similar',
  'incorrect',
]);
export type GradingCategory = z.infer<typeof GradingCategorySchema>;

export const GradingResultWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('grading-result'),
  data: z.object({
    attemptId: z.number().int().positive().optional(),
    score: z.number().int().min(0).max(100),
    isCorrect: z.boolean(),
    category: GradingCategorySchema.optional(),
    userAnswer: z.string(),
    referenceAnswer: z.string(),
    explanation: z.string(),
    tags: z.array(ErrorTagSchema),
    quickActions: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          action: z.string(),
        })
      )
      .optional(),
  }),
});

/* ============================================================
 * 6. progress-summary
 * ========================================================== */
export const MasteryRowSchema = z.object({
  tag: z.string(),
  score: z.number().int().min(0).max(100),
  delta: z.number().int(), // 相比上轮变化
});

export const ProgressSummaryWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('progress-summary'),
  data: z.object({
    title: z.string(),
    sceneName: z.string(),
    questionsCount: z.number().int().nonnegative(),
    averageScore: z.number().int().min(0).max(100),
    averageScoreDelta: z.number().int(),
    categoryCounts: z
      .object({
        exact: z.number().int().nonnegative(),
        similar: z.number().int().nonnegative(),
        incorrect: z.number().int().nonnegative(),
      })
      .optional(),
    weakTagsCount: z.number().int().nonnegative(),
    masteredScenesCount: z.number().int().nonnegative(),
    masteries: z.array(MasteryRowSchema).default([]),
    strongPoints: z.array(z.string()).default([]),
    weakPoints: z.array(z.string()).default([]),
    nextSuggestions: z
      .array(
        z.object({
          title: z.string(),
          desc: z.string(),
          action: z.string(),
        })
      )
      .default([]),
  }),
});

/* ============================================================
 * 7. answer-review
 * ========================================================== */
export const AnswerReviewItemSchema = z.object({
  questionNo: z.number().int().positive(),
  promptShort: z.string(),
  questionType: QuestionTypeSchema,
  score: z.number().int().min(0).max(100),
  status: z.enum(['ok', 'warn', 'bad']),
  tags: z.array(ErrorTagSchema).default([]),
});

export const AnswerReviewWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('answer-review'),
  data: z.object({
    title: z.string(),
    items: z.array(AnswerReviewItemSchema),
    expandedQuestionNo: z.number().int().positive().optional(),
  }),
});

/* ============================================================
 * 8. intent-confirm
 * ========================================================== */
export const IntentChoiceSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),
  title: z.string(),
  desc: z.string().optional(),
  action: z.string(),
});

export const IntentConfirmWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('intent-confirm'),
  data: z.object({
    question: z.string(),
    choices: z.array(IntentChoiceSchema).min(2).max(3),
    risk: z.enum(['low', 'medium', 'high']).default('low'),
    requireExplicitConfirm: z.boolean().default(false),
  }),
});

/* ============================================================
 * 9. learning-menu
 * ========================================================== */
export const LearningMenuItemSchema = z.object({
  id: z.string(),
  icon: z.string(),
  label: z.string(),
  action: z.string(),
  primary: z.boolean().optional(),
  disabled: z.boolean().optional(),
  disabledReason: z.string().optional(),
});

export const LearningMenuWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('learning-menu'),
  data: z.object({
    sections: z
      .array(
        z.object({
          title: z.string(),
          items: z.array(LearningMenuItemSchema),
        })
      )
      .min(1),
  }),
});

/* ============================================================
 * 10. account-gate
 * ========================================================== */
export const AccountGateWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('account-gate'),
  data: z.object({
    intent: z.enum(['save_progress', 'login_required', 'privacy', 'delete_account']),
    title: z.string(),
    description: z.string(),
    primaryAction: z.object({ label: z.string(), action: z.string() }),
    secondaryAction: z
      .object({ label: z.string(), action: z.string() })
      .optional(),
  }),
});

/* ============================================================
 * 11. follow-up-source
 * ========================================================== */
export const FollowUpSourceWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('follow-up-source'),
  data: z.object({
    sourceKind: z.enum(['grading', 'exercise', 'message', 'chain']),
    sourceLabel: z.string(),
    snippet: z.string(),
    canMarkForReview: z.boolean().default(true),
    chainSteps: z
      .array(z.object({ index: z.number().int().positive(), text: z.string() }))
      .optional(),
  }),
});

/* ============================================================
 * 12. conversation-lock
 * ========================================================== */
export const ConversationLockWidgetSchema = z.object({
  ...widgetBase,
  type: z.literal('conversation-lock'),
  data: z.object({
    variant: z.enum(['practicing', 'grading', 'archived', 'unlocked']),
    title: z.string(),
    description: z.string(),
  }),
});

/* ============================================================
 * Discriminated Union
 * ========================================================== */
export const LearningWidgetSchema = z.discriminatedUnion('type', [
  SceneCardsWidgetSchema,
  ExerciseCardWidgetSchema,
  FillBlankWidgetSchema,
  ChoiceQuestionWidgetSchema,
  GradingResultWidgetSchema,
  ProgressSummaryWidgetSchema,
  AnswerReviewWidgetSchema,
  IntentConfirmWidgetSchema,
  LearningMenuWidgetSchema,
  AccountGateWidgetSchema,
  FollowUpSourceWidgetSchema,
  ConversationLockWidgetSchema,
]);

export type LearningWidget = z.infer<typeof LearningWidgetSchema>;
export type WidgetType = LearningWidget['type'];

export const ALL_WIDGET_TYPES: WidgetType[] = [
  'scene-cards',
  'exercise-card',
  'fill-blank',
  'choice-question',
  'grading-result',
  'progress-summary',
  'answer-review',
  'intent-confirm',
  'learning-menu',
  'account-gate',
  'follow-up-source',
  'conversation-lock',
];
