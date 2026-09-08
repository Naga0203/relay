-- SECURITY FIX (§11): Store SHA-256(token) instead of the raw refresh token value.
--
-- A refresh token is a bearer credential — if the refresh_tokens table is read by an
-- attacker (e.g. via SQL injection or a DB backup leak) all live sessions are
-- immediately compromisable.  Storing only the hash means the raw token value is never
-- at rest in the database; an attacker with read-only DB access gets unusable hashes.
--
-- Migration strategy:
--   1. Add token_hash column (non-null with a temporary default so existing rows are valid).
--   2. Existing tokens cannot be back-filled meaningfully (we don't have the raw values
--      post-storage) — they are effectively invalidated, so all current sessions will
--      require re-login.  This is acceptable and documented.
--   3. Drop the old token column and its index.
--   4. Add unique index on token_hash.

-- Step 1: add token_hash — temporarily nullable so ALTER succeeds on non-empty tables.
ALTER TABLE refresh_tokens ADD COLUMN token_hash VARCHAR(64);

-- Step 2: existing rows get a placeholder hash so NOT NULL constraint can be applied.
--         These rows are functionally invalid (no matching raw token exists) and will
--         simply fail the findByTokenHashAndRevokedFalse lookup → treated as expired.
UPDATE refresh_tokens SET token_hash = 'invalidated-by-v9-migration-' || id WHERE token_hash IS NULL;

-- Step 3: enforce NOT NULL now that all rows have a value.
ALTER TABLE refresh_tokens ALTER COLUMN token_hash SET NOT NULL;

-- Step 4: drop the old plaintext token column and its index.
DROP INDEX IF EXISTS idx_refresh_tokens_token;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS token;

-- Step 5: unique index on token_hash (replaces the unique constraint on token).
CREATE UNIQUE INDEX uq_refresh_tokens_hash ON refresh_tokens(token_hash);
