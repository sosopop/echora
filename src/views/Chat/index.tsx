/**
 * Chat 占位三栏壳
 *
 * 用 prototype 的 .top-nav / .col-* class,后续填实组件。
 */

export default function Chat() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 顶栏 */}
      <header className="top-nav">
        <span className="brand">
          <span className="brand-mark">✱</span>Echora
        </span>
        <span className="session-title" style={{ marginLeft: 24 }}>
          (占位:Chat 三栏壳)
        </span>
        <span className="spacer" />
        <span className="badge badge-soft">awaiting_next</span>
        <span
          className="avatar"
          style={{ marginLeft: 12 }}
          title="占位用户"
        >
          U
        </span>
      </header>

      {/* 三栏 */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns:
            'var(--layout-col-history) minmax(0, 1fr) var(--layout-col-branch)',
          minHeight: 0,
        }}
      >
        {/* 左:历史 */}
        <aside
          style={{
            background: 'var(--color-surface-soft)',
            borderRight: '1px solid var(--color-hairline-soft)',
            padding: 'var(--space-md)',
          }}
        >
          <div className="caption-upper muted">历史会话(占位)</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            后续接入 useChatStore.loadConversations
          </div>
        </aside>

        {/* 中:主流 */}
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-canvas)',
            minWidth: 0,
            padding: 'var(--space-xl)',
          }}
        >
          <div className="msg msg-system">
            <div className="msg-bubble">— 占位:消息流 —</div>
          </div>
          <div className="msg msg-ai">
            <div className="msg-bubble">
              这里是 AI 消息占位。后续 useChatStore.sendMessage 接入真实
              SSE 流。
            </div>
          </div>
          <div className="msg msg-user">
            <div className="msg-bubble">这里是用户消息占位。</div>
          </div>

          <div className="spacer" style={{ flex: 1 }} />

          <div
            className="card-bordered"
            style={{
              maxWidth: 720,
              margin: '0 auto',
              width: '100%',
            }}
          >
            <div className="caption muted">输入区(占位 · chat 模式)</div>
            <input
              className="input"
              placeholder="占位输入框..."
              disabled
              style={{ marginTop: 8 }}
            />
          </div>
        </main>

        {/* 右:辅助追问 */}
        <aside
          style={{
            background: 'var(--color-surface-soft)',
            borderLeft: '1px solid var(--color-hairline-soft)',
            padding: 'var(--space-md)',
          }}
        >
          <div className="caption-upper muted">辅助追问(占位)</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            后续接入 branch_threads + follow-up-source widget
          </div>
        </aside>
      </div>
    </div>
  );
}
