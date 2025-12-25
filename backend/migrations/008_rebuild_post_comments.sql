-- Rebuild post_comments to ensure the schema matches the current app expectations.
-- NOTE: This drops existing comment data.
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS post_comments;

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

PRAGMA foreign_keys = ON;
