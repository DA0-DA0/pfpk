-- Migration number: 0002 	 2025-07-27T04:53:41.385Z
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name COLLATE NOCASE);
