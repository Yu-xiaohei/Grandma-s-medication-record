CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 每天一份排程快照；查询时取 day <= 目标日的最近一条
CREATE TABLE IF NOT EXISTS day_plans (
  day        TEXT PRIMARY KEY,
  tasks      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS records (
  day        TEXT NOT NULL,
  task_id    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('done','missed')),
  items      TEXT NOT NULL DEFAULT '{}',
  vitals     TEXT,
  note       TEXT,
  source     TEXT NOT NULL DEFAULT 'front' CHECK (source IN ('front','admin')),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'family',
  PRIMARY KEY (day, task_id)
);

CREATE INDEX IF NOT EXISTS idx_records_day ON records(day);

-- 每次写入都留痕，便于事后核对谁在什么时候改了什么
CREATE TABLE IF NOT EXISTS record_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  day        TEXT NOT NULL,
  task_id    TEXT NOT NULL,
  action     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  actor      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_day ON record_events(day);

CREATE TABLE IF NOT EXISTS admins (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 210000,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  active_from TEXT,
  active_to   TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL DEFAULT 'admin'
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  first_at   TEXT NOT NULL,
  locked_to  TEXT
);