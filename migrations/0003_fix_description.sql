-- Add description column to media and users tables if they don't exist
ALTER TABLE media ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS description TEXT; 