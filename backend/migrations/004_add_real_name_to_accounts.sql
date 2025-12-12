PRAGMA foreign_keys=OFF;

-- Add real_name to accounts if missing (requires SQLite 3.35+; D1 supports IF NOT EXISTS)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS real_name TEXT;


PRAGMA foreign_keys=ON;
