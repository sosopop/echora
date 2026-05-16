/**
 * 已收集画像 pill 标签组
 */

import type { ProfileDTO } from '@shared/api';
import styles from './index.module.css';

interface Props {
  profile: ProfileDTO | null;
}

export default function ProfilePills({ profile }: Props): JSX.Element {
  const items: Array<{ key: string; label: string; value: string }> = [];
  if (profile?.name) items.push({ key: 'name', label: '姓名', value: profile.name });
  if (profile?.age != null)
    items.push({ key: 'age', label: '年龄', value: String(profile.age) });
  if (profile?.grade)
    items.push({ key: 'grade', label: '年级', value: profile.grade });
  if (profile?.level)
    items.push({ key: 'level', label: '英语水平', value: profile.level });

  return (
    <div className={styles.pills}>
      {items.map((it) => (
        <span key={it.key} className={styles.pill}>
          <span className={styles.pillKey}>{it.label}</span> {it.value}
        </span>
      ))}
    </div>
  );
}
