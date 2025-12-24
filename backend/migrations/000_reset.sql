-- =========================================
-- 000_reset.sql
-- Purpose: Reset all application tables
-- Target: Cloudflare D1 (SQLite)
-- Notes:
-- - No BEGIN / COMMIT (D1 restriction)
-- - Disable FK temporarily to allow DROP
-- =========================================

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS
  post_shares,
  post_comments,
  post_likes,
  post_media_pet_tags,
  owner_friendships,
  pet_follows,
  post_media,
  posts,
  pets,
  owners,
  media_assets,
  accounts;

PRAGMA foreign_keys = ON;
