-- Sequence generator per conversation for deterministic message ordering
CREATE SEQUENCE message_sequence_seq START WITH 1;

CREATE TABLE messages (
    id              UUID         PRIMARY KEY DEFAULT random_uuid(),
    conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID         NOT NULL REFERENCES users(id),
    content         TEXT,
    message_type    VARCHAR(20)  NOT NULL DEFAULT 'TEXT',
    sequence_number BIGINT       NOT NULL,
    idempotency_key VARCHAR(64)  UNIQUE,
    reply_to_id     UUID         REFERENCES messages(id),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_messages_conv_seq    ON messages(conversation_id, sequence_number DESC);
CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender      ON messages(sender_id);
CREATE INDEX idx_messages_idempotency ON messages(idempotency_key);

-- Message reactions
CREATE TABLE message_reactions (
    id         UUID PRIMARY KEY DEFAULT random_uuid(),
    message_id UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, user_id, emoji)
);

-- Message attachments
CREATE TABLE message_attachments (
    id           UUID PRIMARY KEY DEFAULT random_uuid(),
    message_id   UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename     VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes   BIGINT       NOT NULL,
    storage_url  VARCHAR(500) NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attachments_message ON message_attachments(message_id);
