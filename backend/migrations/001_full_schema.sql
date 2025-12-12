PRAGMA foreign_keys = ON;

-- Accounts: login + KYC URLs
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  real_name TEXT,
  phone_number TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  id_license_front_url TEXT,
  id_license_back_url TEXT,
  face_with_license_urll TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owners: profile linked to accounts.account_id
CREATE TABLE IF NOT EXISTS owners (
  account_id TEXT PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  max_pets INTEGER NOT NULL DEFAULT 2,
  city TEXT,
  region TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT fk_owner_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

-- Pets
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
  CONSTRAINT fk_pets_owner FOREIGN KEY (owner_id) REFERENCES owners(account_id) ON DELETE CASCADE,
  CONSTRAINT chk_pet_gender CHECK (gender IN ('male', 'female', 'unknown'))
);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);

-- Pet follows
CREATE TABLE IF NOT EXISTS pet_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_owner_id TEXT NOT NULL,
  pet_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_pet_follows_owner FOREIGN KEY (follower_owner_id) REFERENCES owners(account_id) ON DELETE CASCADE,
  CONSTRAINT fk_pet_follows_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT uq_pet_follow UNIQUE (follower_owner_id, pet_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_follows_pet ON pet_follows(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_owner ON pet_follows(follower_owner_id);

-- Owner friendships (owner_id < friend_id)
CREATE TABLE IF NOT EXISTS owner_friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_friend_owner FOREIGN KEY (owner_id) REFERENCES owners(account_id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_friend FOREIGN KEY (friend_id) REFERENCES owners(account_id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_requested_by FOREIGN KEY (requested_by) REFERENCES owners(account_id) ON DELETE CASCADE,
  CONSTRAINT uq_friend_pair UNIQUE (owner_id, friend_id),
  CONSTRAINT chk_friend_status CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  CONSTRAINT chk_friend_order CHECK (owner_id < friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_owner ON owner_friendships(owner_id);
CREATE INDEX IF NOT EXISTS idx_friend_friend ON owner_friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_status ON owner_friendships(status);

-- Posts (author_id = owners.uuid)
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  media_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES owners(uuid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);

-- Media objects (owner_id = owners.account_id)
CREATE TABLE IF NOT EXISTS media_objects (
  key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  bucket TEXT NOT NULL DEFAULT 'rubypets-media-dev',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_id) REFERENCES owners(account_id) ON DELETE CASCADE
);

-- Seed demo data
INSERT OR IGNORE INTO accounts (account_id, email, password_hash, real_name, phone_number, is_verified, created_at, updated_at)
VALUES ('demo-owner', 'demo@rubypets.com', '', 'Demo User', NULL, 0, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO owners (account_id, uuid, display_name, avatar_url, max_pets, city, region, created_at, updated_at, is_active)
VALUES ('demo-owner', 'demo-user', 'Demo User', NULL, 2, NULL, NULL, datetime('now'), datetime('now'), 1);
