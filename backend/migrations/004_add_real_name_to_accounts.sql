PRAGMA foreign_keys=OFF;

-- Add real_name to accounts if missing (requires SQLite 3.35+; D1 supports IF NOT EXISTS)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS real_name TEXT;

-- Backfill from owners.display_name when available
UPDATE accounts
SET real_name = (
  SELECT o.display_name
  FROM owners o
  WHERE o.account_id = accounts.account_id
)
WHERE real_name IS NULL;

PRAGMA foreign_keys=ON;
