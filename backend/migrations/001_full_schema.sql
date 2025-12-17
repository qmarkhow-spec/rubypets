PRAGMA foreign_keys = ON;

-- Accounts: login + KYC URLs
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  real_name TEXT,
  id_number TEXT,
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','blocked')),
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
  id               TEXT PRIMARY KEY,
  owner_id         INTEGER NOT NULL,               -- 發文者飼主
  content_text     TEXT,                           -- 可空（純媒體貼文）
  visibility       TEXT NOT NULL DEFAULT 'public'
                   CHECK (visibility IN ('public','friends','private')),
  is_deleted       INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  -- 媒體摘要（快取/方便列表）
  has_media        INTEGER NOT NULL DEFAULT 0 CHECK (has_media IN (0, 1)),
  media_count      INTEGER NOT NULL DEFAULT 0,

  -- 互動計數快取
  like_count       INTEGER NOT NULL DEFAULT 0,
  comment_count    INTEGER NOT NULL DEFAULT 0,
  repost_count     INTEGER NOT NULL DEFAULT 0,
  share_count      INTEGER NOT NULL DEFAULT 0,

  -- 關聯（回覆/轉發）
  reply_to_post_id INTEGER,
  origin_post_id   INTEGER,

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       INTEGER NOT NULL,
  CONSTRAINT fk_posts_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_reply_to_post FOREIGN KEY (reply_to_post_id) REFERENCES posts(id) ON DELETE SET NULL,
  CONSTRAINT fk_origin_post FOREIGN KEY (origin_post_id) REFERENCES posts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_owner_id ON posts(owner_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_origin_post_id ON posts(origin_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_reply_to_post_id ON posts(reply_to_post_id);

CREATE TABLE IF NOT EXISTS post_media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER NOT NULL,
  media_type    TEXT NOT NULL CHECK (media_type IN ('image','video')),
  url           TEXT NOT NULL,
  thumbnail_url TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,        -- 顯示順序
  width         INTEGER,
  height        INTEGER,
  duration_sec  INTEGER,                           -- 影片長度（秒），圖片可為 NULL
  created_at    INTEGER NOT NULL,
  CONSTRAINT fk_post_media_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_post_order ON post_media(post_id, order_index);

CREATE TABLE IF NOT EXISTS post_media_pet_tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL,
  media_id    INTEGER NOT NULL,
  pet_id      INTEGER NOT NULL,
  x_percent   REAL,                                -- 0~100
  y_percent   REAL,                                -- 0~100
  created_at  INTEGER NOT NULL,
  CONSTRAINT fk_media_tags_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_tags_media FOREIGN KEY (media_id) REFERENCES post_media(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_tags_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_tags_post_id ON post_media_pet_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON post_media_pet_tags(media_id);
CREATE INDEX IF NOT EXISTS idx_media_tags_pet_id ON post_media_pet_tags(pet_id);

CREATE TABLE IF NOT EXISTS post_likes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  owner_id   INTEGER NOT NULL,                      -- 以飼主身分按讚
  created_at INTEGER NOT NULL,
  CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_likes_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  UNIQUE (post_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_owner_id ON post_likes(owner_id);

CREATE TABLE IF NOT EXISTS post_comments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id           INTEGER NOT NULL,
  owner_id          INTEGER NOT NULL,
  parent_comment_id INTEGER,
  content_text      TEXT NOT NULL,
  like_count        INTEGER NOT NULL DEFAULT 0,     -- 可先留著，未來要做留言按讚再用
  is_deleted        INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  CONSTRAINT fk_post_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES post_comments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_created_at ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON post_comments(parent_comment_id);

CREATE TABLE IF NOT EXISTS post_shares (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id        INTEGER NOT NULL,
  owner_id       INTEGER,                           -- 未登入分享可為 NULL（看你的產品）
  share_channel  TEXT,                              -- copy_link/line/facebook/...
  created_at     INTEGER NOT NULL,
  CONSTRAINT fk_post_shares_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_shares_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_post_shares_post_id ON post_shares(post_id);
CREATE INDEX IF NOT EXISTS idx_post_shares_owner_id ON post_shares(owner_id);


-- Seed demo data
INSERT OR IGNORE INTO owners (account_id, uuid, display_name, avatar_url, max_pets, city, region, created_at, updated_at, is_active)
VALUES ('demo-owner', 'demo-user', 'Demo User', NULL, 2, NULL, NULL, datetime('now'), datetime('now'), 1);
