CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user  ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- Notifications
CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT random_uuid(),
    user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type              VARCHAR(30)  NOT NULL,
    title             VARCHAR(200) NOT NULL,
    content           TEXT,
    reference_id      UUID,
    conversation_id   UUID         REFERENCES conversations(id) ON DELETE CASCADE,
    read              BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user      ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notifications_reference ON notifications(reference_id);
