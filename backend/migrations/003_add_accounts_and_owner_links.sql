PRAGMA foreign_keys=OFF;

-- Clean up partial runs (idempotent reruns)
DROP TABLE IF EXISTS owners_new;
DROP TABLE IF EXISTS pets_new;
DROP TABLE IF EXISTS pet_follows_new;
DROP TABLE IF EXISTS owner_friendships_new;
DROP TABLE IF EXISTS media_objects_new;

-- 1) Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone_number TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  id_license_front_url TEXT,
  id_license_back_url TEXT,
  face_with_license_urll TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed accounts from existing owners (prefer existing account_id if it already exists, otherwise fallback to id)
INSERT OR IGNORE INTO accounts (account_id, email, password_hash, phone_number, is_verified, created_at, updated_at)
SELECT COALESCE(account_id, id), email, password_hash, NULL, 0, created_at, updated_at FROM owners;

-- 2) Recreate owners table without id/email/password_hash, add account_id
CREATE TABLE IF NOT EXISTS owners_new (
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

INSERT INTO owners_new (account_id, uuid, display_name, avatar_url, max_pets, city, region, created_at, updated_at, is_active)
SELECT COALESCE(account_id, id), uuid, display_name, avatar_url, max_pets, city, region, created_at, updated_at, is_active FROM owners;

DROP TABLE owners;
ALTER TABLE owners_new RENAME TO owners;

-- 3) Recreate pets with FK to owners(account_id)
CREATE TABLE IF NOT EXISTS pets_new (
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
INSERT INTO pets_new (id, owner_id, name, species, breed, gender, birthday, avatar_url, bio, followers_count, created_at, updated_at, is_active)
SELECT id, owner_id, name, species, breed, gender, birthday, avatar_url, bio, followers_count, created_at, updated_at, is_active FROM pets;
DROP TABLE pets;
ALTER TABLE pets_new RENAME TO pets;
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);

-- 4) Recreate pet_follows with FK to owners(account_id)
CREATE TABLE IF NOT EXISTS pet_follows_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_owner_id TEXT NOT NULL,
  pet_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_pet_follows_owner FOREIGN KEY (follower_owner_id) REFERENCES owners(account_id) ON DELETE CASCADE,
  CONSTRAINT fk_pet_follows_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT uq_pet_follow UNIQUE (follower_owner_id, pet_id)
);
INSERT INTO pet_follows_new (id, follower_owner_id, pet_id, created_at)
SELECT id, follower_owner_id, pet_id, created_at FROM pet_follows;
DROP TABLE pet_follows;
ALTER TABLE pet_follows_new RENAME TO pet_follows;
CREATE INDEX IF NOT EXISTS idx_pet_follows_pet ON pet_follows(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_owner ON pet_follows(follower_owner_id);

-- 5) Recreate owner_friendships with FK to owners(account_id)
CREATE TABLE IF NOT EXISTS owner_friendships_new (
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
INSERT INTO owner_friendships_new (id, owner_id, friend_id, status, requested_by, created_at, updated_at)
SELECT id, owner_id, friend_id, status, requested_by, created_at, updated_at FROM owner_friendships;
DROP TABLE owner_friendships;
ALTER TABLE owner_friendships_new RENAME TO owner_friendships;
CREATE INDEX IF NOT EXISTS idx_friend_owner ON owner_friendships(owner_id);
CREATE INDEX IF NOT EXISTS idx_friend_friend ON owner_friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_status ON owner_friendships(status);

-- 6) Recreate media_objects with FK to owners(account_id)
CREATE TABLE IF NOT EXISTS media_objects_new (
  key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  bucket TEXT NOT NULL DEFAULT 'rubypets-media-dev',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_id) REFERENCES owners(account_id) ON DELETE CASCADE
);
INSERT INTO media_objects_new (key, owner_id, content_type, size_bytes, bucket, created_at)
SELECT key, owner_id, content_type, size_bytes, bucket, created_at FROM media_objects;
DROP TABLE media_objects;
ALTER TABLE media_objects_new RENAME TO media_objects;

-- 7) Seed demo account/owner if missing
INSERT OR IGNORE INTO accounts (account_id, email, password_hash, phone_number, is_verified, created_at, updated_at)
VALUES ('demo-owner', 'demo@rubypets.com', '', NULL, 0, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO owners (account_id, uuid, display_name, avatar_url, max_pets, city, region, created_at, updated_at, is_active)
VALUES ('demo-owner', 'demo-user', 'Demo User', NULL, 2, NULL, NULL, datetime('now'), datetime('now'), 1);

PRAGMA foreign_keys=ON;
