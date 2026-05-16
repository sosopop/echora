/**
 * 主题 store(Zustand)
 *
 * 与 doc/design/scripts/interactions.js 兼容:
 *   - localStorage key: echora-theme
 *   - 写入 documentElement.dataset.theme = 'light' | 'dark'
 *   - 'system' 时移除 dataset.theme,让 CSS @media (prefers-color-scheme) 生效
 */

import { create } from 'zustand';

const STORAGE_KEY = 'echora-theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  setTheme(t: ThemeMode): void;
  apply(): void; // 启动时调:从 localStorage 读取并应用
}

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function writeStored(t: ThemeMode): void {
  try {
    if (t === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

function applyToDocument(t: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (t === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', t);
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStored(),

  setTheme(t) {
    writeStored(t);
    applyToDocument(t);
    set({ theme: t });
  },

  apply() {
    const t = readStored();
    applyToDocument(t);
    set({ theme: t });
  },
}));
