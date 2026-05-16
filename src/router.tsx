/**
 * 路由表
 *
 * /          → 重定向到 /chat
 * /login     → Login
 * /register  → Register
 * /onboarding → Onboarding
 * /chat      → Chat 三栏壳
 */

import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App.js';
import Login from './views/Login/index.js';
import Register from './views/Register/index.js';
import Onboarding from './views/Onboarding/index.js';
import Chat from './views/Chat/index.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'chat', element: <Chat /> },
    ],
  },
]);
