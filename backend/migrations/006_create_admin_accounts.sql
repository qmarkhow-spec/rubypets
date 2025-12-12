PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_admin_id ON admin_accounts(admin_id);

PRAGMA foreign_keys=ON;
