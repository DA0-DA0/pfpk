-- Add name and audience to profile_tokens table.
ALTER TABLE profile_tokens ADD COLUMN name TEXT;
ALTER TABLE profile_tokens ADD COLUMN audience TEXT;
