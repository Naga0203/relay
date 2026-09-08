-- SECURITY FIX (§8): Audit log table for public-key uploads.
--
-- Every time a user replaces their ECDH public key we record:
--   - which user changed it
--   - the SHA-256 hex digest of the old and new key (not the raw keys — they're
--     already stored in the users table; we want a compact, tamper-evident record)
--   - when the change happened and from which IP
--
-- This does NOT prevent a malicious server operator from swapping keys (they
-- control the DB), but it:
--   1. Creates a forensic trail that can be audited post-incident.
--   2. Slows automated key-swap attacks when combined with the 1-change-per-hour
--      rate limit enforced at the application layer (UserService.updatePublicKey).

CREATE TABLE public_key_audit_log (
    id          UUID DEFAULT random_uuid() PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_key_hash VARCHAR(64),   -- SHA-256 hex of the previous public key (NULL on first upload)
    new_key_hash VARCHAR(64) NOT NULL, -- SHA-256 hex of the new public key
    changed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_ip   VARCHAR(45)              -- IPv4 (max 15) or IPv6 (max 45)
);

CREATE INDEX idx_key_audit_user ON public_key_audit_log(user_id, changed_at DESC);
