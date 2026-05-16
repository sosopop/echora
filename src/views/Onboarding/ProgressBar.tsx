/**
 * Onboarding 顶部进度条
 *
 * 步骤数 = REQUIRED + 关注的 OPTIONAL(此处用 [name, grade, level])。
 * 已收集的字段 step 标 done,正在收集的下一字段标 active。
 */

import type { ProfileDTO } from '@shared/api';
import styles from './index.module.css';

interface Props {
  profile: ProfileDTO | null;
}

const STEPS: Array<{ key: 'name' | 'grade' | 'level'; label: string }> = [
  { key: 'name', label: '姓名' },
  { key: 'grade', label: '年级' },
  { key: 'level', label: '英语水平' },
];

export default function ProgressBar({ profile }: Props): JSX.Element {
  const filled = STEPS.map((s) => !!profile?.[s.key]);
  const filledCount = filled.filter(Boolean).length;
  const activeIndex = filled.findIndex((v) => !v);

  return (
    <header className={styles.progressHeader}>
      <span className={styles.brand}>
        <span className={styles.brandMark}>✱</span> Echora
      </span>
      <div className={styles.steps}>
        {STEPS.map((s, i) => {
          const cls =
            i < filledCount
              ? `${styles.step} ${styles.stepDone}`
              : i === activeIndex
              ? `${styles.step} ${styles.stepActive}`
              : styles.step;
          return <span key={s.key} className={cls} />;
        })}
      </div>
      <span className={styles.counter}>
        {filledCount} / {STEPS.length} ·{' '}
        {activeIndex >= 0 ? STEPS[activeIndex].label : '完成'}
      </span>
    </header>
  );
}
