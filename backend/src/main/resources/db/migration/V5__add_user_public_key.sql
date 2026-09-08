-- Add E2EE public key column to users table
ALTER TABLE users ADD COLUMN public_key VARCHAR(2000);
