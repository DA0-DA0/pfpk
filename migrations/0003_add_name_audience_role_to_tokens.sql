-- Add name, audience, and role to profile_tokens table.
ALTER TABLE profile_tokens ADD COLUMN name TEXT;
ALTER TABLE profile_tokens ADD COLUMN audience TEXT;
ALTER TABLE profile_tokens ADD COLUMN role TEXT;
