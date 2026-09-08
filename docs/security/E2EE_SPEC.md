# Relay End-to-End Encryption (E2EE) Specification — v3.0

## 1. Overview

Relay implements End-to-End Encryption (E2EE) using WebCrypto APIs. All message contents and file attachments are encrypted on the client device before transmission and remain encrypted at rest on the server. The server functions purely as an encrypted payload relay and zero-knowledge storage provider.

---

## 2. Cryptographic Primitives

| Purpose | Algorithm / Primitive | Key Size / Parameters |
|---|---|---|
| Identity Key Pair | ECDH (Elliptic Curve Diffie-Hellman) | NIST P-256 (secp256r1) |
| Key Derivation Function | HKDF (HMAC-based Key Derivation) | SHA-256 |
| Symmetric Encryption | AES-GCM (Galois/Counter Mode) | 256-bit key, 96-bit random IV |
| Per-Message Key Wrapping | AES-GCM | 256-bit (pairwise session key wraps message key) |
| Key Fingerprints | SHA-256 | 12 groups of 5 digits (Signal/WhatsApp style) |
| Local Key Storage | IndexedDB | Extracted JWKs stored locally |

---

## 3. Protocol Workflows

### 3.1 Identity Key Generation & Upload
1. On first login or registration, the client checks IndexedDB (`relay-e2e-keys` store) for an existing identity key pair.
2. If absent, the client generates a P-256 ECDH key pair via `crypto.subtle.generateKey`.
3. The private key is stored securely in IndexedDB and never leaves the browser.
4. The public key is exported as a JWK, base64-encoded, and uploaded to `PUT /api/v1/users/me/public-key`.
5. **SECURITY FIX (§8)**: The server rate-limits key uploads to 1 per hour per user and writes every change to `public_key_audit_log` with old/new key hashes and the client IP.

### 3.2 Key Exchange & Shared Secret Derivation
1. When User A opens a chat with User B, User A fetches User B's public key (either from conversation member metadata or via `GET /api/v1/users/{userId}/public-key`).
2. User A performs ECDH key agreement between User A's private key and User B's public key:
   $$\text{SharedBits} = \text{ECDH}(\text{PrivateKey}_A, \text{PublicKey}_B)$$
3. User A derives a 256-bit symmetric AES-GCM key using HKDF:
   - **PRK**: $\text{HKDF-Extract}(\text{salt} = \text{"relay-e2e-v2-salt"}, \text{IKM} = \text{SharedBits})$
   - **OKM**: $\text{HKDF-Expand}(\text{PRK}, \text{info} = \text{"relay-e2e-v2-conv:"} \parallel \text{conversationId}, L = 32)$
4. Derived session keys are cached in memory for the duration of the web session.

### 3.3 Message Encryption & Decryption (Direct Chats)
- **Encryption**:
  $$\text{IV} \leftarrow \text{RandomBytes}(12)$$
  $$\text{Ciphertext} \leftarrow \text{AES-GCM-256-Encrypt}(\text{Key}_{\text{session}}, \text{IV}, \text{Plaintext})$$
  $$\text{Payload} = \text{"e2e:v2:"} \parallel \text{Base64}(\text{IV}) \parallel \text{":"} \parallel \text{Base64}(\text{Ciphertext})$$
- **Decryption**:
  - Parse payload prefix `e2e:v2:`.
  - Extract IV and Ciphertext from base64 strings.
  - Perform `AES-GCM-256-Decrypt`. If authentication tag validation fails, output error indicator.

### 3.4 Group Encryption (Fan-Out, §9) — NEW in v3.0

In group conversations (3+ members), the direct pairwise session key approach cannot work because a message encrypted for one peer's derived key is undecryptable by the other members. Relay uses **sender-side pairwise-wrapped-key fan-out**:

#### Encryption (Sender):
1. Generate a random per-message AES-GCM-256 key:
   $$\text{MessageKey} \leftarrow \text{GenerateKey(AES-GCM, 256, extractable=true)}$$
2. Encrypt the message body once with the message key:
   $$\text{IV}_{\text{body}} \leftarrow \text{RandomBytes}(12)$$
   $$\text{EncryptedBody} = \text{"e2e:v2:"} \parallel \text{Base64}(\text{IV}_{\text{body}}) \parallel \text{":"} \parallel \text{Base64}(\text{AES-GCM-Encrypt}(\text{MessageKey}, \text{IV}_{\text{body}}, \text{Plaintext}))$$
3. Export the raw message key bytes.
4. For each recipient $R_i$ (excluding sender):
   - Derive pairwise session key: $\text{SessionKey}_i = \text{HKDF-ECDH}(\text{PrivateKey}_{\text{sender}}, \text{PublicKey}_{R_i}, \text{conversationId})$
   - Wrap the message key:
     $$\text{WrapIV}_i \leftarrow \text{RandomBytes}(12)$$
     $$\text{WrappedKey}_i = \text{Base64}(\text{WrapIV}_i) \parallel \text{":"} \parallel \text{Base64}(\text{AES-GCM-Encrypt}(\text{SessionKey}_i, \text{WrapIV}_i, \text{RawMessageKey}))$$
5. Send `{ content: EncryptedBody, recipientKeys: { userId_1: WrappedKey_1, ..., userId_N: WrappedKey_N } }`

#### Decryption (Each Recipient):
1. Look up own wrapped key from `recipientKeys[myUserId]`.
2. Derive pairwise session key with the sender: $\text{SessionKey} = \text{HKDF-ECDH}(\text{PrivateKey}_{\text{me}}, \text{PublicKey}_{\text{sender}}, \text{conversationId})$
3. Parse wrapped key blob: extract `WrapIV` and `WrappedCiphertext` from `iv:ciphertext` format.
4. Unwrap message key: $\text{MessageKey} = \text{AES-GCM-Decrypt}(\text{SessionKey}, \text{WrapIV}, \text{WrappedCiphertext})$
5. Import raw bytes as an AES-GCM key and decrypt the message body normally.

#### Backward Compatibility:
Messages sent before §9 deployment have no `recipientKeys`. The client falls back to direct pairwise `decryptText()` when `recipientKeys` is null. For DIRECT (2-person) conversations, fan-out collapses to a single recipient entry — no code branching needed.

### 3.5 Key Verification — TOFU (§8) — NEW in v3.0

Relay implements **Trust On First Use (TOFU)** key pinning:

1. When a user first encounters a peer's public key, the key is pinned in IndexedDB (`peer-keys` store).
2. On subsequent encounters, the pinned key is compared against the current key from the server.
3. If the key has changed:
   - A **non-dismissible warning banner** is shown in the chat UI.
   - Message sending is **blocked** until the user explicitly acknowledges the key change.
   - The user can compare old vs. new **security codes** (SHA-256 fingerprints formatted as 12 groups of 5 digits).
4. Verification is out-of-band — users compare fingerprints via voice call or in person.
5. Accessible via the "End-to-End Encrypted" badge in the chat header (opens the Security Code modal).

---

## 4. Server-Side Storage

| Table | Purpose |
|---|---|
| `messages.content` | AES-GCM ciphertext (server is zero-knowledge) |
| `message_recipient_keys` | Per-recipient wrapped message keys (§9) |
| `users.public_key` | ECDH P-256 public key (base64 JWK) |
| `public_key_audit_log` | Every key change with old/new hashes and client IP (§8) |

---

## 5. Known Limitations & Threat Vectors

> [!WARNING]
> - **No Forward Secrecy**: Static ECDH key pairs are used. If a private key is compromised, all past messages encrypted under that key can be decrypted. Future iterations will adopt the Double Ratchet Algorithm.
> - **XSS Risk**: Web Crypto keys stored in IndexedDB are accessible to scripts running in the same origin. Robust Content-Security-Policy (CSP) headers are critical.
> - **Not MLS/Sender Keys**: The group encryption scheme is pairwise-wrapped-key fan-out, not the Message Layer Security (MLS) protocol. Each recipient gets an independently wrapped copy of the per-message key. This is O(N) in group size for each send but simpler and more auditable than tree-based ratcheting.
> - **No Key Transparency**: Key verification relies on manual out-of-band comparison (TOFU + fingerprints). There is no automatic key transparency log or CT-style auditing.
