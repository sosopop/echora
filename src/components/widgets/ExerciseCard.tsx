/**
 * ExerciseCard Widget — 练习题主卡片
 *
 * 数据来源:practice skill widget-ready 落到 data
 *   - attemptId / stage / questionNo / questionType / contextZh / contextEn / hint / inputMode
 * 交互:用户作答从底部 ChatInput 输入,触发 sendAction({ type: 'submit-answer', ... })
 *      本组件只展示题面,不带输入框(输入由 ChatInput 统一管理)
 */

import type { LearningWidgetInstance } from '@shared/skill';
import styles from './widgets.module.css';

interface ExerciseCardData {
  attemptId?: number;
  stage?: number;
  totalStages?: number;
  questionNo?: number;
  stageGoal?: number;
  totalQuestions?: number;
  questionType?: string;
  contextZh?: string;
  contextEn?: string;
  targetZh?: string;
  remediationKind?: 'retry' | 'replacement';
  hint?: string;
  inputMode?: 'fill' | 'chat';
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

export default function ExerciseCard({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element | null {
  const data = (widget.data ?? {}) as ExerciseCardData;
  if (
    widget.status !== 'ready' ||
    typeof data.attemptId !== 'number' ||
    typeof data.stage !== 'number' ||
    typeof data.questionNo !== 'number' ||
    typeof data.questionType !== 'string' ||
    typeof data.contextZh !== 'string' ||
    data.contextZh.trim().length === 0
  ) {
    return null;
  }
  const questionLabel = labelForQuestionType(data.questionType);
  const stageLabel =
    data.remediationKind === 'replacement'
      ? '替换题'
      : data.stage === 5
      ? '重练'
      : typeof data.totalStages === 'number'
      ? `阶段 ${data.stage}/${data.totalStages}`
      : `阶段 ${data.stage ?? '?'}`;
  const questionNoLabel =
    typeof data.stageGoal === 'number'
      ? `第 ${data.questionNo}/${data.stageGoal} 题`
      : `第 ${data.questionNo ?? '?'} 题`;
  const progressTotal =
    typeof data.stageGoal === 'number' && data.stageGoal > 0
      ? Math.min(data.stageGoal, 6)
      : 0;
  const progressDone =
    typeof data.questionNo === 'number'
      ? Math.max(0, Math.min(data.questionNo, progressTotal))
      : 0;
  return (
    <div className={styles.exerciseCard}>
      <div className={styles.exerciseHead}>
        <span className={styles.exerciseStage}>{stageLabel}</span>
        <span>{questionNoLabel}</span>
        <span>· {questionLabel}</span>
      </div>
      {progressTotal > 0 && (
        <div
          className={styles.exerciseProgress}
          aria-label={`进度 ${progressDone}/${data.stageGoal}`}
        >
          {Array.from({ length: progressTotal }).map((_, index) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className={
                index < progressDone
                  ? styles.exerciseProgressDotActive
                  : styles.exerciseProgressDot
              }
            />
          ))}
        </div>
      )}
      {data.contextZh && (
        <div className={styles.exerciseContextZh}>{data.contextZh}</div>
      )}
      {data.targetZh && (
        <div className={styles.exerciseTarget}>
          <div className={styles.exerciseTargetLabel}>请表达</div>
          <div className={styles.exerciseTargetText}>「{data.targetZh}」</div>
        </div>
      )}
      {data.contextEn && (
        <div className={styles.exerciseContextEn}>{data.contextEn}</div>
      )}
      {data.hint && <div className={styles.exerciseHint}>提示:{data.hint}</div>}
      <div className={styles.exerciseFoot}>
        在底部输入答案后按 Enter 提交。
      </div>
    </div>
  );
}
