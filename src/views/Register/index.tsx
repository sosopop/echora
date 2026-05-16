/**
 * Register 视图 — 邮箱 + 密码 + 确认密码注册
 *
 * 提交后由 useAuthStore.register 处理 token + profile.load,
 * RouteGuard 会自动跳转到 /onboarding(profile 必为空)。
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.js';

export default function Register(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);
  const storeError = useAuthStore((s) => s.error);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError('请填写邮箱与密码');
      return;
    }
    if (password.length < 8) {
      setLocalError('密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setLocalError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password);
      // RouteGuard 会跳转到 /onboarding
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
          创建账号
        </h1>
        <p
          className="muted body-sm"
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          注册后由 Echo 引导完成画像采集,约 60 秒
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
            设置密码
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
            disabled={submitting}
            required
            minLength={8}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label className="field-label" htmlFor="confirm">
            确认密码
          </label>
          <input
            id="confirm"
            type="password"
            className="input"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="再输一次"
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
          {submitting ? '注册中…' : '创建账号'}
        </button>

        <p className="caption muted" style={{ marginTop: 'var(--space-md)', textAlign: 'center' }}>
          已有账号?<Link to="/login">直接登录</Link>
        </p>
      </form>
    </div>
  );
}
