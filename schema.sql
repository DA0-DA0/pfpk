-- Profile
DROP TABLE IF EXISTS profiles;

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  name TEXT,
  nftChainId TEXT,
  nftCollectionAddress TEXT,
  nftTokenId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- unique uuid among all profiles
  CONSTRAINT unique_uuid UNIQUE (uuid),
  -- unique name among all profiles
  CONSTRAINT unique_name UNIQUE (name COLLATE NOCASE)
);

CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name COLLATE NOCASE);

-- ProfilePublicKey
DROP TABLE IF EXISTS profile_public_keys;

CREATE TABLE profile_public_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  type TEXT NOT NULL,
  publicKeyHex TEXT NOT NULL,
  addressHex TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  -- unique public key, only one profile can claim a given public key
  CONSTRAINT unique_type_public_key_hex UNIQUE (type, publicKeyHex)
);

CREATE INDEX IF NOT EXISTS idx_profile_public_keys_public_key_hex ON profile_public_keys(publicKeyHex);

-- ProfilePublicKeyChainPreference
DROP TABLE IF EXISTS profile_public_key_chain_preferences;

CREATE TABLE profile_public_key_chain_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  profilePublicKeyId INTEGER NOT NULL,
  chainId TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_public_keys FOREIGN KEY (profilePublicKeyId) REFERENCES profile_public_keys (id) ON DELETE CASCADE,
  -- only one preference for a given chain per profile
  CONSTRAINT unique_profile_chain_preference UNIQUE (profileId, chainId)
);

CREATE INDEX IF NOT EXISTS idx_profile_public_key_chain_preferences_profile_chain ON profile_public_key_chain_preferences(profileId, chainId);

-- ProfileTokens
DROP TABLE IF EXISTS profile_tokens;

CREATE TABLE profile_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profileId INTEGER NOT NULL,
  uuid TEXT NOT NULL,
  name TEXT,
  -- json array of strings
  audience TEXT,
  scope TEXT,
  role TEXT,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE,
  -- unique uuid among all tokens
  CONSTRAINT unique_uuid UNIQUE (uuid)
);

CREATE INDEX IF NOT EXISTS idx_profile_tokens_uuid ON profile_tokens(uuid);

CREATE INDEX IF NOT EXISTS idx_profile_tokens_profile_expires_at ON profile_tokens(profileId, expiresAt);

-- Nonces
DROP TABLE IF EXISTS nonces;

CREATE TABLE nonces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publicKeyType TEXT NOT NULL,
  publicKeyHex TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- unique public key, only one nonce per public key
  CONSTRAINT unique_public_key UNIQUE (publicKeyType, publicKeyHex)
);

CREATE INDEX IF NOT EXISTS idx_nonces_public_key ON nonces(publicKeyType, publicKeyHex);