-- ARCH FIX (§1): Add unique constraint on (conversation_id, sequence_number) so the DB
-- enforces sequence uniqueness as a hard safety net even if the application-level
-- optimistic-counter logic somehow produces a duplicate.
ALTER TABLE messages
    ADD CONSTRAINT uq_messages_conv_seq UNIQUE (conversation_id, sequence_number);
