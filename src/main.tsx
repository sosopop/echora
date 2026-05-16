/**
 * 启动入口
 *
 * 顺序:
 *   1. 导入样式(tokens / components)
 *   2. 应用主题(避免 FOUT)
 *   3. 注入 401 回调到 api client
 *   4. hydrate auth(从 localStorage 读取 token 验活)
 *   5. 挂载 React
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { useThemeStore } from './stores/theme.js';
import { useAuthStore } from './stores/auth.js';
import { setOnUnauthorized } from './api/client.js';

import './styles/tokens.css';
import './styles/components.css';

useThemeStore.getState().apply();

setOnUnauthorized(() => {
  useAuthStore.getState().logout();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
});

void useAuthStore.getState().hydrate();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('找不到 #root 元素');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
