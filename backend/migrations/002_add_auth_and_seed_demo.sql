PRAGMA foreign_keys = ON;

-- Add auth-related columns (safe to re-run in Cloud SQL migration with equivalent DDL)
ALTER TABLE users ADD COLUMN password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Seed a demo user for unauthenticated posting flows
INSERT OR IGNORE INTO users (id, handle, display_name, email, password_hash, avatar_url, created_at)
VALUES ('demo-user', 'demo', 'Demo User', 'demo@rubypets.com', NULL, NULL, datetime('now'));
