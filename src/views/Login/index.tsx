/**
 * Login 视图 — 邮箱 + 密码登录
 *
 * 提交后由 useAuthStore.login 处理 token + profile.load,
 * RouteGuard 会根据 onboardingCompleted 自动跳转到 /chat 或 /onboarding。
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.js';

export default function Login(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const storeError = useAuthStore((s) => s.error);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError('请填写邮箱与密码');
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      // RouteGuard 会接管跳转
    } catch {
      // store 已记录 error
    } finally {
      setSubmitting(false);
    }
  };

  const error = localError ?? storeError;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl)',
      }}
    >
      <form
        onSubmit={onSubmit}
        className="card-cream"
        style={{ maxWidth: 420, width: '100%' }}
      >
        <h1 className="display-md" style={{ marginBottom: 'var(--space-xs)' }}>
          欢迎回来
        </h1>
        <p
          className="muted body-sm"
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          继续上次的英语练习
        </p>

        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label className="field-label" htmlFor="email">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={submitting}
            required
          />
        </div>

        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label className="field-label" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
            disabled={submitting}
            required
            minLength={8}
          />
        </div>

        {error && (
          <p className="field-error" role="alert" style={{ marginBottom: 'var(--space-md)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={submitting}
        >
          {submitting ? '登录中…' : '登录'}
        </button>

        <p className="caption muted" style={{ marginTop: 'var(--space-md)', textAlign: 'center' }}>
          还没有账号?<Link to="/register">立即注册</Link>
        </p>
      </form>
    </div>
  );
}
