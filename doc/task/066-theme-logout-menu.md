# 066 - 主题切换与退出登录菜单

## 任务背景

产品缺少两个基础功能入口：
1. 主题切换 — `useThemeStore` 已完整实现（light/dark/system），但无 UI 触发
2. 退出登录 — `useAuthStore.logout()` 存在，但仅在 401 时自动调用，用户无法主动操作

## 执行摘要

在 Chat 视图顶栏的用户头像（avatar）上添加点击弹出菜单（popover），包含：
- 用户邮箱显示
- 主题三联切换（亮色 / 暗色 / 跟随系统）
- 退出登录按钮

### 修改文件

- `src/views/Chat/index.tsx` — 添加 popover 状态、点击外部关闭、主题切换、退出登录逻辑
- `src/views/Chat/index.module.css` — 添加 `.avatarPopover`、`.themeRow`、`.themeOption`、`.menuItem`、`.menuItemDanger` 等样式

### 复用

- `useThemeStore`（`src/stores/theme.ts`）— `theme` / `setTheme()`
- `useAuthStore`（`src/stores/auth.ts`）— `user` / `logout()`
- `useNavigate`（react-router-dom）— 退出后跳转 `/login`

## 手工测试

1. `npm run dev:web` 打开页面
2. 点击右上角头像 → 弹出菜单，显示邮箱
3. 点击"暗色" → 页面切换为暗色主题，刷新后保持
4. 点击"亮色" → 恢复亮色
5. 点击"跟随系统" → 跟随 OS 偏好
6. 点击"退出登录" → 跳转到登录页，token 已清除
7. 点击菜单外部区域 → 菜单关闭
8. `npm run test:web` — 98 tests passed，无回归

## 遗留 TODO

无

## 下一阶段建议

- 如需更多设置项（如修改密码、语言偏好），可将 popover 扩展为完整设置面板
