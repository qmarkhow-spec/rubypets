-- Add index to speed up comment thread pagination.
CREATE INDEX IF NOT EXISTS idx_comments_post_parent_created_at
  ON post_comments (post_id, parent_comment_id, created_at);
