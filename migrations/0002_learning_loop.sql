-- ============================================================
-- Echora · 0002_learning_loop
-- 加载学习闭环所需的两张新表与 5 个 ALTER ADD COLUMN
-- 对应 PRD §2.5 + §2.6 + §2.7
-- ============================================================

-- ============================================================
-- 1. scene_dialogues — 选定场景后 AI 生成的完整双语对话数据
-- ============================================================
CREATE TABLE IF NOT EXISTS scene_dialogues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  scene_id        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  difficulty      TEXT    NOT NULL,                     -- CEFR A1..C2
  roles_json      TEXT    NOT NULL DEFAULT '[]',        -- JSON: ["Customer","Waiter"]
  turns_json      TEXT    NOT NULL DEFAULT '[]',        -- JSON: [{role,en,zh}]
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scene_dialogue_conv
  ON scene_dialogues(conversation_id);

-- ============================================================
-- 2. scene_history — 已用场景队列(每用户最大 10 条,服务层负责 prune)
-- ============================================================
CREATE TABLE IF NOT EXISTS scene_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scene_topic TEXT    NOT NULL,
  used_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scene_history_user
  ON scene_history(user_id, used_at DESC);

-- ============================================================
-- 3. ALTER 加列 — 向后兼容,旧 stub 数据不受影响
-- ============================================================

-- messages 加 branch_thread_id(支线消息归属,本期 schema 准备,003 不实现支线逻辑)
ALTER TABLE messages
  ADD COLUMN branch_thread_id INTEGER REFERENCES branch_threads(id) ON DELETE SET NULL;

-- branch_threads 补 user_id 与 status(PRD §2.7)
ALTER TABLE branch_threads ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE branch_threads ADD COLUMN status  TEXT NOT NULL DEFAULT 'open';

-- exercise_attempts 加 scene_id / stage / question_no / retry_count(PRD §2.7 + §2.6)
ALTER TABLE exercise_attempts ADD COLUMN scene_id    TEXT;
ALTER TABLE exercise_attempts ADD COLUMN stage       INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exercise_attempts ADD COLUMN question_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exercise_attempts ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;

-- mastery_records 加 difficulty_score(PRD §2.7,exercise_attempts 旧列冗余但不破坏)
ALTER TABLE mastery_records ADD COLUMN difficulty_score INTEGER NOT NULL DEFAULT 500;
