/**
 * 路由守卫
 *
 * 矩阵(基于 hydrated / user / profileLoaded / isComplete / 当前路由):
 *   1. 未 hydrate 完成              → 渲染空(避免闪烁)
 *   2. 未登录 + 在 /login|/register → 放行
 *   3. 未登录 + 其他路由             → → /login
 *   4. 已登录 + 在 /login|/register → → /chat
 *   5. profile 未加载完成           → 渲染空(等加载)
 *   6. 已登录 + onboarding 未完成 + 不在 /onboarding → → /onboarding
 *   7. 已登录 + onboarding 已完成 + 在 /onboarding   → → /chat
 *   8. 其他                         → 放行
 */

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.js';
import {
  useProfileStore,
  selectIsOnboardingComplete,
} from '../stores/profile.js';

const AUTH_ROUTES = ['/login', '/register'];
const ONBOARDING_ROUTE = '/onboarding';

interface Props {
  children: ReactNode;
}

export default function RouteGuard({ children }: Props): JSX.Element | null {
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const profileLoaded = useProfileStore((s) => s.loaded);
  const isOnboardingComplete = useProfileStore(selectIsOnboardingComplete);
  const location = useLocation();

  if (!hydrated) return null;

  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);
  const isOnboardingRoute = location.pathname === ONBOARDING_ROUTE;

  if (!user) {
    if (isAuthRoute) return <>{children}</>;
    return <Navigate to="/login" replace />;
  }

  if (isAuthRoute) {
    return <Navigate to="/chat" replace />;
  }

  if (!profileLoaded) return null;

  if (!isOnboardingComplete && !isOnboardingRoute) {
    return <Navigate to="/onboarding" replace />;
  }

  if (isOnboardingComplete && isOnboardingRoute) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}
