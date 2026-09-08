-- ARCH FIX (§9): Per-recipient wrapped message keys for group E2EE.
--
-- The previous E2EE model derived a single pairwise session key from one peer's
-- public key.  In a group with 3+ members, a message encrypted for one peer's
-- derived key was undecryptable by the others.
--
-- New scheme (sender-side fan-out):
--   1. Sender generates a random AES-GCM-256 "message key" per outgoing message.
--   2. Message body is encrypted once with that message key.
--   3. For each recipient (excluding sender), the message key is wrapped (encrypted)
--      under the pairwise ECDH session key between sender and that recipient.
--   4. Each wrapped key blob is stored here, keyed by (message_id, user_id).
--
-- On the receiving side, each recipient looks up their own wrapped key, unwraps it
-- with their pairwise session key with the sender, then decrypts the body.
--
-- For DIRECT (2-person) conversations this collapses to a single recipient entry.
-- The general case handles both DIRECT and GROUP without separate code paths.

CREATE TABLE message_recipient_keys (
    message_id  UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_key TEXT         NOT NULL,   -- base64-encoded AES-GCM ciphertext of the per-message key
    PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_mrk_user ON message_recipient_keys(user_id);
