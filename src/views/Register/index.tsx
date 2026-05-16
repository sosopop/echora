/**
 * Register 占位页 — 后续接入 useAuthStore.register
 */

import { Link } from 'react-router-dom';

export default function Register() {
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
          创建账号
        </h1>
        <p className="muted" style={{ marginBottom: 'var(--space-lg)' }}>
          占位:后续接入 useAuthStore.register(email, password)
        </p>
        <button className="btn btn-primary btn-block" disabled>
          注册(占位)
        </button>
        <p className="caption" style={{ marginTop: 'var(--space-md)' }}>
          已有账号?<Link to="/login">直接登录</Link>
        </p>
      </div>
    </div>
  );
}
