PRAGMA foreign_keys = OFF;

-- Recreate posts to link to owner uuid instead of users table.
CREATE TABLE posts_new (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL, -- stores owner uuid
  body TEXT NOT NULL,
  media_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO posts_new (id, author_id, body, media_key, created_at)
SELECT id, author_id, body, media_key, created_at FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);

PRAGMA foreign_keys = ON;
