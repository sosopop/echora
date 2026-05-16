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
  questionNo?: number;
  questionType?: string;
  contextZh?: string;
  contextEn?: string;
  hint?: string;
  inputMode?: 'fill' | 'chat';
}

export default function ExerciseCard({
  widget,
}: {
  widget: LearningWidgetInstance;
}): JSX.Element {
  const data = (widget.data ?? {}) as ExerciseCardData;
  const isFill = data.questionType === 'fill_word';
  return (
    <div className={styles.exerciseCard}>
      <div className={styles.exerciseHead}>
        <span className={styles.exerciseStage}>
          阶段 {data.stage ?? '?'}
        </span>
        <span>第 {data.questionNo ?? '?'} 题</span>
        <span>· {isFill ? '单词填空' : '整句翻译'}</span>
      </div>
      {data.contextZh && (
        <div className={styles.exerciseContextZh}>{data.contextZh}</div>
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
