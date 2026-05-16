/**
 * 学习态机镜像 store(Zustand)
 *
 * 服务端是事实源,本 store 仅缓存最新值供前端响应渲染。
 * 转移合法性校验仅 console.warn,不阻断(以服务端为准)。
 */

import { create } from 'zustand';
import type { LearningState } from '@shared/skill';

const ALLOWED_TRANSITIONS: Record<LearningState, LearningState[]> = {
  onboarding: ['scene_selecting'],
  scene_selecting: ['practicing', 'reviewing'],
  practicing: ['grading', 'awaiting_next'],
  grading: ['awaiting_next'],
  awaiting_next: [
    'practicing',
    'scene_selecting',
    'reviewing',
    'archived',
  ],
  reviewing: ['practicing', 'scene_selecting', 'archived'],
  archived: [],
};

interface LearningStateStore {
  state: LearningState;
  setState(next: LearningState): void;
}

export const useLearningStateStore = create<LearningStateStore>((set, get) => ({
  state: 'onboarding',

  setState(next) {
    const current = get().state;
    if (current === next) return;
    const allowed = ALLOWED_TRANSITIONS[current];
    if (allowed.length > 0 && !allowed.includes(next)) {
      console.warn(
        `[learningState] 非法转移 ${current} → ${next} (服务端可能强制更新,以服务端为准)`
      );
    }
    set({ state: next });
  },
}));
