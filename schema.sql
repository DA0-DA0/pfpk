-- Profile
DROP TABLE IF EXISTS profiles;

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  nonce INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  nftChainId TEXT,
  nftCollectionAddress TEXT,
  nftTokenId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- unique uuid among all profiles
  CONSTRAINT unique_uuid UNIQUE (uuid),
  -- unique name among all profiles
  CONSTRAINT unique_name UNIQUE (name)
);

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