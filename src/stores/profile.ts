/**
 * 用户画像 store(Zustand)
 *
 * 接 GET /api/profile 与 PUT /api/profile。
 * 与 onboarding skill 联动:skill 在后端落库后,前端通过 chat store 消费
 * state-transition 事件时调 reload() 拉最新值。
 */

import { create } from 'zustand';
import { profileApi } from '../api/profile.js';
import type { ProfileDTO, ProfileUpdateReq } from '@shared/api';

interface ProfileState {
  profile: ProfileDTO | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;

  load(): Promise<void>;
  reload(): Promise<void>;
  update(patch: ProfileUpdateReq): Promise<void>;
  reset(): void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: false,
  loaded: false,
  error: null,

  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const profile = await profileApi.get();
      set({ profile, loading: false, loaded: true });
    } catch (e) {
      set({
        loading: false,
        loaded: true, // 标记已尝试,即使失败,避免守卫死锁
        error: e instanceof Error ? e.message : '加载画像失败',
      });
    }
  },

  async reload() {
    set({ loading: true, error: null });
    try {
      const profile = await profileApi.get();
      set({ profile, loading: false, loaded: true });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '刷新画像失败',
      });
    }
  },

  async update(patch) {
    set({ error: null });
    try {
      const profile = await profileApi.update(patch);
      set({ profile });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '更新画像失败' });
      throw e;
    }
  },

  reset() {
    set({ profile: null, loaded: false, loading: false, error: null });
  },
}));

/**
 * Selector:onboarding 是否完成(必填 name + level)。
 * 用于 RouteGuard 与 Onboarding 视图判断完成状态。
 */
export function selectIsOnboardingComplete(s: ProfileState): boolean {
  return !!(s.profile && s.profile.name && s.profile.level);
}
