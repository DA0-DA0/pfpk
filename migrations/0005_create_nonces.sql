-- Migration number: 0005 	 2025-08-02T03:38:41.346Z
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