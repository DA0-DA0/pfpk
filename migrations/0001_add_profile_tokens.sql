-- Migration number: 0001 	 2025-07-26T15:03:24.741Z
CREATE TABLE profile_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  uuid TEXT NOT NULL,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  -- unique uuid among all tokens
  CONSTRAINT unique_uuid UNIQUE (uuid)
);

CREATE INDEX IF NOT EXISTS idx_profile_tokens_uuid ON profile_tokens(uuid);

CREATE INDEX IF NOT EXISTS idx_profile_tokens_profile_expires_at ON profile_tokens(profileId, expiresAt);