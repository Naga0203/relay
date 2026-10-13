-- Add profile fields: username, age, gender, account_type to users
ALTER TABLE users ADD COLUMN username VARCHAR(50);
ALTER TABLE users ADD COLUMN age INTEGER;
ALTER TABLE users ADD COLUMN gender VARCHAR(20);
ALTER TABLE users ADD COLUMN account_type VARCHAR(10) DEFAULT 'MAJOR' NOT NULL;

-- Backfill usernames for any existing users
UPDATE users SET username = LOWER(REPLACE(name, ' ', '_')) WHERE username IS NULL;

-- Enforce lowercase username check and unique constraint (H2 + Postgres compatible)
ALTER TABLE users
    ADD CONSTRAINT chk_users_username_lowercase
    CHECK (username IS NULL OR username = LOWER(username));

ALTER TABLE users
    ADD CONSTRAINT uq_users_username UNIQUE (username);

-- Add last_read_sequence to conversation_members for accurate unread counts
ALTER TABLE conversation_members ADD COLUMN last_read_sequence BIGINT DEFAULT 0 NOT NULL;
