-- SECURITY FIX (§6): Add a case-insensitive unique constraint on email so the
-- database enforces uniqueness regardless of casing, matching the application-level
-- normalisation (all emails stored lowercase after this fix).
--
-- H2 (dev): LOWER() in a functional index is not supported via the same syntax as
-- PostgreSQL.  We drop and recreate the unique constraint as a case-insensitive
-- CHECK + unique index instead, which H2 handles correctly.
--
-- PostgreSQL (prod): LOWER(email) functional unique index is the idiomatic approach.

-- Step 1: Drop the plain unique index/constraint added by V1 (if present).
-- We use IF EXISTS so the migration is re-runnable safely.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_email;

-- Step 2: Add a new constraint that enforces lowercase-only storage.
-- Since AuthService now always writes normalised emails, this CHECK is a safety net.
ALTER TABLE users
    ADD CONSTRAINT chk_users_email_lowercase
    CHECK (email = LOWER(email));

-- Step 3: Recreate the unique index.  In PostgreSQL this would be:
--   CREATE UNIQUE INDEX uq_users_email_lower ON users (LOWER(email));
-- In H2 (which we use for dev/test) a plain UNIQUE constraint on the already-lowercased
-- column is equivalent because the CHECK above guarantees the value is always lowercase.
ALTER TABLE users
    ADD CONSTRAINT uq_users_email UNIQUE (email);
