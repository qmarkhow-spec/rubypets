PRAGMA foreign_keys=OFF;

-- Add id_number to accounts for storing national ID.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS id_number TEXT;

PRAGMA foreign_keys=ON;
