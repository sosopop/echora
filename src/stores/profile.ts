/**
 * 用户画像 store(Zustand)
 *
 * V1 仅前端缓存,API 留 TODO。
 * 真实业务后续接入 GET/PUT /api/profile,与 onboarding skill 联动。
 */

import { create } from 'zustand';

export interface UserProfile {
  name: string | null;
  age: number | null;
  grade: string | null;
  level: string | null; // CEFR
  weaknessTags: string[];
  recentTopics: string[];
}

interface ProfileState {
  profile: UserProfile;
  loaded: boolean;
  loadProfile(): Promise<void>;
  updateProfile(patch: Partial<UserProfile>): void;
}

const EMPTY_PROFILE: UserProfile = {
  name: null,
  age: null,
  grade: null,
  level: null,
  weaknessTags: [],
  recentTopics: [],
};

export const useProfileStore = create<ProfileState>((set) => ({
  profile: EMPTY_PROFILE,
  loaded: false,

  async loadProfile() {
    // TODO V1.x: 调 GET /api/profile,后端补 routes/profile.ts
    set({ loaded: true });
  },

  updateProfile(patch) {
    set((state) => ({
      profile: { ...state.profile, ...patch },
    }));
    // TODO V1.x: 调 PUT /api/profile 同步
  },
}));
