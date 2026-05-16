/**
 * RouteGuard 6 矩阵单测(Vitest + RTL)
 *
 *   1. 未登录 + auth 路由         → 放行 children
 *   2. 未登录 + 普通路由          → Navigate /login
 *   3. 已登录 + 未完成 + 非 onboarding → Navigate /onboarding
 *   4. 已登录 + 已完成 + onboarding → Navigate /chat
 *   5. 已登录 + 已完成 + auth 路由 → Navigate /chat
 *   6. 已登录 + 已完成 + 普通路由 → 放行 children
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RouteGuard from '../../components/RouteGuard';
import { useAuthStore } from '../../stores/auth';
import { useProfileStore } from '../../stores/profile';
import type { ProfileDTO } from '@shared/api';

const completeProfile: ProfileDTO = {
  userId: 1,
  name: '小李',
  age: null,
  grade: '高二',
  level: 'B1',
  weaknessTags: [],
  recentTopics: [],
  createdAt: '',
  updatedAt: '',
};

const incompleteProfile: ProfileDTO = {
  ...completeProfile,
  name: null,
  level: null,
};

beforeEach(() => {
  // 重置 store
  useAuthStore.setState({
    token: null,
    user: null,
    hydrated: true,
    hydrating: false,
    error: null,
  });
  useProfileStore.setState({
    profile: null,
    loading: false,
    loaded: false,
    error: null,
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/login"
          element={
            <RouteGuard>
              <div data-testid="content">[login]</div>
            </RouteGuard>
          }
        />
        <Route
          path="/register"
          element={
            <RouteGuard>
              <div data-testid="content">[register]</div>
            </RouteGuard>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RouteGuard>
              <div data-testid="content">[onboarding]</div>
            </RouteGuard>
          }
        />
        <Route
          path="/chat"
          element={
            <RouteGuard>
              <div data-testid="content">[chat]</div>
            </RouteGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('RouteGuard 矩阵', () => {
  it('1. 未登录 + auth 路由 → 放行', () => {
    const { getByTestId } = renderAt('/login');
    expect(getByTestId('content').textContent).toBe('[login]');
  });

  it('2. 未登录 + 普通路由 → 跳 /login', () => {
    const { queryByTestId, getByTestId } = renderAt('/chat');
    expect(queryByTestId('content')?.textContent).toBe('[login]');
    expect(getByTestId('content').textContent).toBe('[login]');
  });

  it('3. 已登录 + 未完成 + 非 onboarding → 跳 /onboarding', () => {
    useAuthStore.setState({ user: { id: 1, email: 'a@b.com' } });
    useProfileStore.setState({ profile: incompleteProfile, loaded: true });
    const { getByTestId } = renderAt('/chat');
    expect(getByTestId('content').textContent).toBe('[onboarding]');
  });

  it('4. 已登录 + 已完成 + onboarding → 跳 /chat', () => {
    useAuthStore.setState({ user: { id: 1, email: 'a@b.com' } });
    useProfileStore.setState({ profile: completeProfile, loaded: true });
    const { getByTestId } = renderAt('/onboarding');
    expect(getByTestId('content').textContent).toBe('[chat]');
  });

  it('5. 已登录 + auth 路由 → 跳 /chat', () => {
    useAuthStore.setState({ user: { id: 1, email: 'a@b.com' } });
    useProfileStore.setState({ profile: completeProfile, loaded: true });
    const { getByTestId } = renderAt('/login');
    expect(getByTestId('content').textContent).toBe('[chat]');
  });

  it('6. 已登录 + 已完成 + 普通路由 → 放行', () => {
    useAuthStore.setState({ user: { id: 1, email: 'a@b.com' } });
    useProfileStore.setState({ profile: completeProfile, loaded: true });
    const { getByTestId } = renderAt('/chat');
    expect(getByTestId('content').textContent).toBe('[chat]');
  });

  it('未 hydrate → 渲染空(无 content testid)', () => {
    useAuthStore.setState({ hydrated: false });
    const { queryByTestId } = renderAt('/chat');
    expect(queryByTestId('content')).toBeNull();
  });

  it('已登录 + onboarding 路由 + profile 未加载 → 渲染空', () => {
    useAuthStore.setState({ user: { id: 1, email: 'a@b.com' } });
    useProfileStore.setState({ loaded: false, profile: null });
    const { queryByTestId } = renderAt('/onboarding');
    expect(queryByTestId('content')).toBeNull();
  });
});
