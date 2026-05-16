/**
 * 鉴权 store(Zustand)
 *
 * token 持久化到 localStorage.echora_token。
 * hydrate 在启动时调用,验活并填充 user。
 */

import { create } from 'zustand';
import { authApi } from '../api/auth.js';
import { setTokenGetter } from '../api/client.js';
import type { MeResp } from '@shared/api';

const STORAGE_KEY = 'echora_token';

interface AuthState {
  token: string | null;
  user: MeResp | null;
  hydrating: boolean;
  error: string | null;
  hydrate(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage 禁用,忽略 */
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: readStoredToken(),
  user: null,
  hydrating: false,
  error: null,

  async hydrate() {
    const token = get().token;
    if (!token) {
      set({ hydrating: false, user: null });
      return;
    }
    set({ hydrating: true, error: null });
    try {
      const user = await authApi.me();
      set({ user, hydrating: false });
    } catch {
      writeStoredToken(null);
      set({ token: null, user: null, hydrating: false });
    }
  },

  async login(email: string, password: string) {
    set({ error: null });
    try {
      const resp = await authApi.login({ email, password });
      writeStoredToken(resp.token);
      set({ token: resp.token, user: resp.user });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '登录失败' });
      throw e;
    }
  },

  async register(email: string, password: string) {
    set({ error: null });
    try {
      const resp = await authApi.register({ email, password });
      writeStoredToken(resp.token);
      set({ token: resp.token, user: resp.user });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '注册失败' });
      throw e;
    }
  },

  logout() {
    writeStoredToken(null);
    set({ token: null, user: null, error: null });
  },
}));

// 把 token getter 注入 api client(模块加载时执行一次)
setTokenGetter(() => useAuthStore.getState().token);
