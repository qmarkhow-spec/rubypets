PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS media_assets (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('image','video')),
  usage         TEXT NOT NULL DEFAULT 'other' CHECK (usage IN ('avatar','pet_avatar','post','kyc','other')),
  storage_key   TEXT NOT NULL,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('r2','cf_media')),
  url           TEXT,
  thumbnail_url TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  width         INTEGER CHECK (width IS NULL OR width >= 0),
  height        INTEGER CHECK (height IS NULL OR height >= 0),
  duration_sec  INTEGER CHECK (duration_sec IS NULL OR duration_sec >= 0),
  status        TEXT NOT NULL DEFAULT 'ready'
               CHECK (status IN ('uploaded','processing','ready','failed')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_media_assets_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner_id ON media_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_usage ON media_assets(usage);
CREATE INDEX IF NOT EXISTS idx_media_assets_kind ON media_assets(kind);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  real_name TEXT,
  id_number TEXT,
  phone_number TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0,1)),
  id_license_front_asset_id TEXT,
  id_license_back_asset_id  TEXT,
  face_with_license_asset_id TEXT,
  id_license_front_url TEXT,
  id_license_back_url TEXT,
  face_with_license_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_kyc_front_asset FOREIGN KEY (id_license_front_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_kyc_back_asset  FOREIGN KEY (id_license_back_asset_id)  REFERENCES media_assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_kyc_face_asset  FOREIGN KEY (face_with_license_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS owners (
  uuid TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL UNIQUE
  CHECK (
    length(display_name) BETWEEN 3 AND 20
    AND display_name GLOB '[a-z0-9._]*'
    AND display_name NOT GLOB '*[^a-z0-9._]*'
    AND substr(display_name, 1, 1) NOT IN ('.', '_')
    AND substr(display_name, length(display_name), 1) NOT IN ('.', '_')
    AND instr(display_name, '..') = 0
    AND instr(display_name, '__') = 0
  ),
  avatar_asset_id TEXT,
  avatar_url TEXT,
  max_pets INTEGER NOT NULL DEFAULT 2,
  city TEXT,
  region TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  CONSTRAINT fk_owner_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_owner_avatar_asset FOREIGN KEY (avatar_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_owners_avatar_asset_id ON owners(avatar_asset_id);
CREATE INDEX IF NOT EXISTS idx_owners_display_name ON owners(display_name);


CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  class TEXT,
  species TEXT,
  breed TEXT,
  gender TEXT DEFAULT 'unknown',
  birthday TEXT,
  avatar_asset_id TEXT,
  avatar_url TEXT,
  bio TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  CONSTRAINT fk_pets_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_pet_avatar_asset FOREIGN KEY (avatar_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  CONSTRAINT chk_pet_gender CHECK (gender IN ('male', 'female', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);
CREATE INDEX IF NOT EXISTS idx_pets_avatar_asset_id ON pets(avatar_asset_id);

CREATE TABLE IF NOT EXISTS pet_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_owner_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_pet_follows_owner FOREIGN KEY (follower_owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_pet_follows_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT uq_pet_follow UNIQUE (follower_owner_id, pet_id)
);

CREATE INDEX IF NOT EXISTS idx_pet_follows_pet ON pet_follows(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_owner ON pet_follows(follower_owner_id);
CREATE INDEX idx_pet_follows_owner_id_desc ON pet_follows(follower_owner_id, id DESC);
CREATE INDEX idx_pet_follows_pet_id_desc ON pet_follows(pet_id, id DESC);

CREATE TABLE IF NOT EXISTS owner_friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  requested_by TEXT NOT NULL,
  pair_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_friend_owner        FOREIGN KEY (owner_id)     REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_friend_friend       FOREIGN KEY (friend_id)    REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_friend_requested_by FOREIGN KEY (requested_by) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT chk_not_self CHECK (owner_id != friend_id),
  CONSTRAINT chk_canonical_order CHECK (owner_id < friend_id),
  CONSTRAINT chk_requested_by_in_pair CHECK (requested_by = owner_id OR requested_by = friend_id),
  CONSTRAINT chk_pair_key_format CHECK (
    pair_key = owner_id || '#' || friend_id
    AND instr(pair_key, '#') > 1
    AND instr(pair_key, '#') < length(pair_key)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_friendships_pair_key ON owner_friendships(pair_key);
CREATE INDEX IF NOT EXISTS idx_owner_friendships_status ON owner_friendships(status);
CREATE INDEX IF NOT EXISTS idx_owner_friendships_requested_by_status ON owner_friendships(requested_by, status);
CREATE INDEX IF NOT EXISTS idx_owner_friendships_owner_status ON owner_friendships(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_owner_friendships_friend_status ON owner_friendships(friend_id, status);

CREATE TABLE IF NOT EXISTS posts (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL,
  content_text     TEXT,
  visibility       TEXT NOT NULL DEFAULT 'public'
                   CHECK (visibility IN ('public','friends','private')),
  is_deleted       INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  media_count      INTEGER NOT NULL DEFAULT 0 CHECK (media_count >= 0),
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text','image_set','video')),
  like_count       INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count    INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  repost_count     INTEGER NOT NULL DEFAULT 0 CHECK (repost_count >= 0),
  share_count      INTEGER NOT NULL DEFAULT 0 CHECK (share_count >= 0),
  reply_to_post_id TEXT,
  origin_post_id   TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_posts_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_reply_to_post FOREIGN KEY (reply_to_post_id) REFERENCES posts(id) ON DELETE SET NULL,
  CONSTRAINT fk_origin_post FOREIGN KEY (origin_post_id) REFERENCES posts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_owner_id ON posts(owner_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_origin_post_id ON posts(origin_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_reply_to_post_id ON posts(reply_to_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);

CREATE TABLE IF NOT EXISTS post_media (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL,
  asset_id    TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_post_media_post  FOREIGN KEY (post_id)  REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_media_asset FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT,
  UNIQUE(post_id, order_index),
  UNIQUE(post_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_asset_id ON post_media(asset_id);
CREATE INDEX IF NOT EXISTS idx_post_media_post_order ON post_media(post_id, order_index);

CREATE TABLE IF NOT EXISTS post_media_pet_tags (
  id          TEXT PRIMARY KEY,
  media_id    TEXT NOT NULL,
  pet_id      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_media_tags_media FOREIGN KEY (media_id) REFERENCES post_media(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_tags_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  UNIQUE(media_id, pet_id)
);

CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON post_media_pet_tags(media_id);
CREATE INDEX IF NOT EXISTS idx_media_tags_pet_id ON post_media_pet_tags(pet_id);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_likes_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  UNIQUE (post_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_owner_id ON post_likes(owner_id);

CREATE TABLE IF NOT EXISTS post_comments (
  id                TEXT PRIMARY KEY,
  post_id           TEXT NOT NULL,
  owner_id          TEXT NOT NULL,
  parent_comment_id TEXT,
  content_text      TEXT NOT NULL,
  like_count        INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  is_deleted        INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_post_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES post_comments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_created_at ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_parent_created_at ON post_comments (post_id, parent_comment_id, created_at);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT fk_comment_likes_comment
    FOREIGN KEY (comment_id)
    REFERENCES post_comments(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_comment_likes_owner
    FOREIGN KEY (owner_id)
    REFERENCES owners(uuid)
    ON DELETE CASCADE,

  UNIQUE (comment_id, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);

CREATE INDEX IF NOT EXISTS idx_comment_likes_owner_id ON comment_likes(owner_id);


CREATE TABLE IF NOT EXISTS post_shares (
  id            TEXT PRIMARY KEY,
  post_id        TEXT NOT NULL,
  owner_id       TEXT,
  share_channel  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_post_shares_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_shares_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_post_shares_post_id ON post_shares(post_id);
CREATE INDEX IF NOT EXISTS idx_post_shares_owner_id ON post_shares(owner_id);

CREATE TABLE IF NOT EXISTS chat_threads (
  id                TEXT PRIMARY KEY,
  owner_a_id         TEXT NOT NULL,
  owner_b_id         TEXT NOT NULL,
  pair_key           TEXT NOT NULL UNIQUE, 
  request_state      TEXT NOT NULL DEFAULT 'none'
                    CHECK (request_state IN ('none','pending','accepted','rejected')),
  request_sender_id  TEXT,                 
  request_message_id TEXT,                
  last_message_id    TEXT,
  last_activity_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_chat_threads_owner_a FOREIGN KEY (owner_a_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_chat_threads_owner_b FOREIGN KEY (owner_b_id) REFERENCES owners(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_owner_a ON chat_threads(owner_a_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_owner_b ON chat_threads(owner_b_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_activity ON chat_threads(last_activity_at);


CREATE TABLE IF NOT EXISTS chat_thread_participants (
  thread_id            TEXT NOT NULL,
  owner_id             TEXT NOT NULL,
  last_read_message_id TEXT,
  archived_at          TEXT,
  deleted_at           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_ctp_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_ctp_owner  FOREIGN KEY (owner_id)  REFERENCES owners(uuid) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_ctp_owner ON chat_thread_participants(owner_id);
CREATE INDEX IF NOT EXISTS idx_ctp_owner_deleted ON chat_thread_participants(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_ctp_owner_archived ON chat_thread_participants(owner_id, archived_at);


CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL,
  sender_id  TEXT NOT NULL,
  body_text  TEXT NOT NULL CHECK (length(body_text) <= 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_chat_messages_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_sender FOREIGN KEY (sender_id) REFERENCES owners(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);

CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
  fcm_token TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_push_tokens_owner FOREIGN KEY (owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  UNIQUE (fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_owner_id ON push_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_owner_active ON push_tokens(owner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);


CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_owner_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('post_like','post_comment','comment_like','comment_reply','friend_request')),
  group_key TEXT,
  post_id TEXT,
  comment_id TEXT,
  friendship_id INTEGER,
  actor_count INTEGER NOT NULL DEFAULT 0 CHECK (actor_count >= 0),
  latest_actor_owner_id TEXT,
  latest_action_at TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  read_at TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0,1)),
  hidden_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_comment FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_friendship FOREIGN KEY (friendship_id) REFERENCES owner_friendships(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_group_key
  ON notifications(group_key)
  WHERE group_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_hidden_sort
  ON notifications(recipient_owner_id, is_hidden, latest_action_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_owner_id, is_hidden, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_post_id ON notifications(post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON notifications(comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_friendship_id ON notifications(friendship_id);


CREATE TABLE IF NOT EXISTS notification_actors (
  notification_id TEXT NOT NULL,
  actor_owner_id TEXT NOT NULL,
  first_action_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_action_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_notification_actors_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_actors_actor FOREIGN KEY (actor_owner_id) REFERENCES owners(uuid) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, actor_owner_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_actors_actor_owner_id ON notification_actors(actor_owner_id);
CREATE INDEX IF NOT EXISTS idx_notification_actors_notification_last_action
  ON notification_actors(notification_id, last_action_at);
