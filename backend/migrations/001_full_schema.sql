PRAGMA foreign_keys = ON;

-- Owners (飼主)
CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  max_pets INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Pets (飼主底下的寵物)
CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT,
  breed TEXT,
  gender TEXT DEFAULT 'unknown',
  birthday TEXT,
  avatar_url TEXT,
  bio TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT fk_pets_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  CONSTRAINT chk_pet_gender CHECK (gender IN ('male', 'female', 'unknown'))
);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);

-- 飼主追蹤寵物
CREATE TABLE IF NOT EXISTS pet_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_owner_id TEXT NOT NULL,
  pet_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_pet_follows_owner FOREIGN KEY (follower_owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_pet_follows_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT uq_pet_follow UNIQUE (follower_owner_id, pet_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_follows_pet ON pet_follows(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_owner ON pet_follows(follower_owner_id);

-- 飼主好友 / 邀請（對稱：owner_id < friend_id）
CREATE TABLE IF NOT EXISTS owner_friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_friend_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_friend FOREIGN KEY (friend_id) REFERENCES owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_requested_by FOREIGN KEY (requested_by) REFERENCES owners(id) ON DELETE CASCADE,
  CONSTRAINT uq_friend_pair UNIQUE (owner_id, friend_id),
  CONSTRAINT chk_friend_status CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  CONSTRAINT chk_friend_order CHECK (owner_id < friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_owner ON owner_friendships(owner_id);
CREATE INDEX IF NOT EXISTS idx_friend_friend ON owner_friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_status ON owner_friendships(status);

-- Posts：作者為 owner uuid（以文字存 uuid）
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  media_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);

-- Media objects（owner uuid 持有）
CREATE TABLE IF NOT EXISTS media_objects (
  key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  bucket TEXT NOT NULL DEFAULT 'rubypets-media-dev',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 預設種子帳號（demo-owner），供未登入情境使用
INSERT OR IGNORE INTO owners (id, uuid, email, password_hash, display_name, avatar_url, max_pets, created_at, updated_at, is_active)
VALUES ('demo-owner', 'demo-user', 'demo@rubypets.com', '', 'Demo User', NULL, 2, datetime('now'), datetime('now'), 1);
