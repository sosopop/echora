/**
 * Login 占位页 — 后续接入 useAuthStore.login
 */

import { Link } from 'react-router-dom';

export default function Login() {
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
      <div
        className="card-cream"
        style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}
      >
        <h1 className="display-md" style={{ marginBottom: 'var(--space-sm)' }}>
          欢迎回来
        </h1>
        <p className="muted" style={{ marginBottom: 'var(--space-lg)' }}>
          占位:后续接入 useAuthStore.login(email, password)
        </p>
        <button className="btn btn-primary btn-block" disabled>
          登录(占位)
        </button>
        <p className="caption" style={{ marginTop: 'var(--space-md)' }}>
          还没有账号?<Link to="/register">立即注册</Link>
        </p>
      </div>
    </div>
  );
}
