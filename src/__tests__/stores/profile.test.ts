/**
 * profile store 单测(Vitest)
 *
 *   - load() 调 GET /profile,设 profile + loaded
 *   - update() 调 PUT /profile 并更新 state
 *   - reset() 清空
 *   - selectIsOnboardingComplete:name + level 都有时为 true
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProfileStore, selectIsOnboardingComplete } from '../../stores/profile';
import type { ProfileDTO } from '@shared/api';

const baseProfile: ProfileDTO = {
  userId: 1,
  name: '小李',
  age: null,
  grade: '高二',
  level: 'B1',
  weaknessTags: [],
  recentTopics: [],
  createdAt: '2026-05-16T00:00:00Z',
  updatedAt: '2026-05-16T00:00:00Z',
};

beforeEach(() => {
  useProfileStore.getState().reset();
  vi.restoreAllMocks();
});

function mockFetch(value: unknown, status = 200): void {
  global.fetch = vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => ({ data: value }),
  })) as unknown as typeof fetch;
}

describe('useProfileStore', () => {
  it('load 拉到 profile,设 loaded=true', async () => {
    mockFetch(baseProfile);
    await useProfileStore.getState().load();
    const s = useProfileStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.profile?.name).toBe('小李');
    expect(s.profile?.level).toBe('B1');
  });

  it('load 失败也置 loaded=true(避免守卫死锁)', async () => {
    mockFetch({ code: 'X', message: 'boom' }, 500);
    // mockFetch 返回 ok=false,response.json 解析为 { data: ... } 实际上 client 会报错
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'X', message: 'boom' } }),
    })) as unknown as typeof fetch;
    await useProfileStore.getState().load();
    const s = useProfileStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.error).not.toBeNull();
  });

  it('update 调 PUT 并更新 state', async () => {
    const updated = { ...baseProfile, name: '李小四' };
    mockFetch(updated);
    await useProfileStore.getState().update({ name: '李小四' });
    expect(useProfileStore.getState().profile?.name).toBe('李小四');
  });

  it('reset 清空', async () => {
    mockFetch(baseProfile);
    await useProfileStore.getState().load();
    expect(useProfileStore.getState().profile).not.toBeNull();
    useProfileStore.getState().reset();
    expect(useProfileStore.getState().profile).toBeNull();
    expect(useProfileStore.getState().loaded).toBe(false);
  });
});

describe('selectIsOnboardingComplete', () => {
  it('name + level 都有 → true', () => {
    expect(
      selectIsOnboardingComplete({
        profile: baseProfile,
        loading: false,
        loaded: true,
        error: null,
        load: async () => {},
        reload: async () => {},
        update: async () => {},
        reset: () => {},
      })
    ).toBe(true);
  });

  it('缺 level → false', () => {
    expect(
      selectIsOnboardingComplete({
        profile: { ...baseProfile, level: null },
        loading: false,
        loaded: true,
        error: null,
        load: async () => {},
        reload: async () => {},
        update: async () => {},
        reset: () => {},
      })
    ).toBe(false);
  });

  it('profile 为 null → false', () => {
    expect(
      selectIsOnboardingComplete({
        profile: null,
        loading: false,
        loaded: false,
        error: null,
        load: async () => {},
        reload: async () => {},
        update: async () => {},
        reset: () => {},
      })
    ).toBe(false);
  });
});
