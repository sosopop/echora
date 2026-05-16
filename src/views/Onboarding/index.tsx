/**
 * Onboarding 占位页 — 后续接入 onboarding skill 流
 */

export default function Onboarding() {
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
        style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}
      >
        <h1 className="display-md" style={{ marginBottom: 'var(--space-sm)' }}>
          先认识下你
        </h1>
        <p className="muted" style={{ marginBottom: 'var(--space-lg)' }}>
          占位:后续接入 onboarding Skill 流(对话式收集 name / age / grade /
          level)
        </p>
        <button className="btn btn-primary">开始(占位)</button>
      </div>
    </div>
  );
}
