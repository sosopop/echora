-- ============================================================
-- Echora · 0001_init
-- 一次性建立 PRD §2.6 全部 10 张业务表 + schema_migrations 元表
-- ============================================================

-- 元表(由 server/db/migrate.ts 维护,这里仅 IF NOT EXISTS 兜底)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 1. users — 账号
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. user_profiles — 画像
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT,
  age           INTEGER,
  grade         TEXT,
  level         TEXT,                      -- CEFR: A1..C2
  weakness_tags TEXT,                      -- JSON array
  recent_topics TEXT,                      -- JSON array
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 3. conversations — 会话
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT,
  status         TEXT    NOT NULL DEFAULT 'active',       -- active / archived
  learning_state TEXT    NOT NULL DEFAULT 'onboarding',   -- 7 学习态(含 archived)
  active_skill   TEXT,
  input_mode     TEXT    NOT NULL DEFAULT 'chat',         -- chat / fill / select / menu
  lock_policy    TEXT    NOT NULL DEFAULT 'open',         -- open / locked
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  archived_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON conversations(user_id, status, updated_at DESC);

-- ============================================================
-- 4. messages — 消息(含 widget 快照与流事件)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL,                       -- text / widget / system
  role            TEXT    NOT NULL,                       -- user / assistant / system
  skill_name      TEXT,
  content         TEXT,                                   -- 累积文本
  widget_snapshot TEXT,                                   -- JSON,LearningWidget 最终态
  stream_events   TEXT,                                   -- JSON array,完整 SkillEvent 序列
  seq             INTEGER NOT NULL DEFAULT 0,             -- 会话内单调
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq
  ON messages(conversation_id, seq);

-- ============================================================
-- 5. branch_threads — 辅助追问支线
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_threads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id   INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source_ref        TEXT,                                 -- JSON: {kind, ...}
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_branch_source
  ON branch_threads(source_message_id);

-- ============================================================
-- 6. exercise_attempts — 练习索引
-- ============================================================
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id       INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  question_type    TEXT    NOT NULL,                      -- 6 题型枚举
  prompt           TEXT    NOT NULL,
  user_answer      TEXT,
  status           TEXT    NOT NULL DEFAULT 'pending',    -- pending / submitted / graded / abandoned
  difficulty_score INTEGER NOT NULL DEFAULT 500,          -- 0-1000,用户不可见
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  submitted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempt_conv
  ON exercise_attempts(conversation_id, created_at DESC);

-- ============================================================
-- 7. grading_results — 批改结果
-- ============================================================
CREATE TABLE IF NOT EXISTS grading_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id  INTEGER NOT NULL UNIQUE REFERENCES exercise_attempts(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL,                            -- 0-100
  is_correct  INTEGER NOT NULL,                            -- 0/1
  corrections TEXT,                                        -- JSON: {explain, refAnswer, diff}
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 8. error_tag_events — 错误标签事件
-- ============================================================
CREATE TABLE IF NOT EXISTS error_tag_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id        INTEGER NOT NULL REFERENCES exercise_attempts(id) ON DELETE CASCADE,
  grading_id        INTEGER NOT NULL REFERENCES grading_results(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag               TEXT    NOT NULL,                      -- 12 错误标签之一
  severity          TEXT    NOT NULL DEFAULT 'medium',     -- low / medium / high
  included_in_stats INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tagevent_user_tag
  ON error_tag_events(user_id, tag);

-- ============================================================
-- 9. mastery_records — 掌握度记录
-- ============================================================
CREATE TABLE IF NOT EXISTS mastery_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag            TEXT    NOT NULL,
  mastery_score  INTEGER NOT NULL DEFAULT 0,               -- 0-100
  attempts_count INTEGER NOT NULL DEFAULT 0,
  correct_count  INTEGER NOT NULL DEFAULT 0,
  next_review_at TEXT,
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, tag)
);

-- ============================================================
-- 10. agent_runs — Agent 执行记录
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT    NOT NULL UNIQUE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  skill_name      TEXT    NOT NULL,
  status          TEXT    NOT NULL,                        -- pending / running / done / failed / aborted
  latency_ms      INTEGER,
  error_type      TEXT,
  payload         TEXT,                                    -- JSON: {decision, params, finalSeq}
  started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user
  ON agent_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_run
  ON agent_runs(run_id);
