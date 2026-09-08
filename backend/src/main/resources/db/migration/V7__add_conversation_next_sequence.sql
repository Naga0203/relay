-- ARCH FIX (§1): Replace MAX()+FOR-UPDATE aggregate-lock approach with a dedicated
-- counter column on the conversations row.  A per-row UPDATE is atomic and locks the
-- conversation row itself (which always exists), eliminating the zero-row race that
-- allowed two concurrent "first messages" to both receive sequence_number = 1.
ALTER TABLE conversations
    ADD COLUMN next_sequence BIGINT NOT NULL DEFAULT 1;

-- Back-fill: for every conversation that already has messages, set next_sequence to
-- MAX(sequence_number) + 1 so future inserts continue from the right value.
UPDATE conversations c
SET    next_sequence = (
           SELECT COALESCE(MAX(m.sequence_number), 0) + 1
           FROM   messages m
           WHERE  m.conversation_id = c.id
       );
