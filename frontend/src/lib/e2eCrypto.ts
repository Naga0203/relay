/**
 * Relay End-to-End Encryption (E2EE) Module — v2
 *
 * SECURITY MODEL:
 * - Each user generates an ECDH key pair (P-256) on first use, stored in IndexedDB.
 * - Public keys are exchanged via the server (server never sees private keys).
 * - Per-conversation symmetric keys are derived via ECDH shared secret + HKDF.
 * - Messages are encrypted with AES-GCM-256 with random 96-bit IVs.
 * - Encryption failures are FATAL — plaintext is never sent as fallback.
 *
 * LIMITATIONS (documented, not hidden):
 * - No forward secrecy (static ECDH, no ratcheting). Future: Double Ratchet.
 * - No post-compromise security. Future: key rotation protocol.
 * - Browser-based key storage (IndexedDB) is vulnerable to XSS.
 * - P-256 used instead of X25519 due to WebCrypto API limitations.
 * - Group chats use pairwise ECDH with sender (not MLS/Sender Keys).
 */

const E2E_PREFIX = 'e2e:v2:';
const DB_NAME = 'relay-e2e-keys';
// SECURITY FIX (§8): DB version bumped from 1 → 2 to add the peer-keys object store
// used for TOFU (Trust-On-First-Use) key pinning.
const DB_VERSION = 2;
const KEY_STORE_NAME = 'identity-keys';
const SESSION_STORE_NAME = 'session-keys';
// SECURITY FIX (§8): New store for TOFU-pinned peer public keys.
const PEER_KEY_STORE_NAME = 'peer-keys';

// ─── IndexedDB Key Storage ────────────────────────────────────────────

function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        db.createObjectStore(SESSION_STORE_NAME, { keyPath: 'id' });
      }
      // SECURITY FIX (§8): peer-keys store for TOFU pinning.
      // Each record: { id: userId, publicKeyBase64, firstSeenAt, trustedAt? }
      if (!db.objectStoreNames.contains(PEER_KEY_STORE_NAME)) {
        db.createObjectStore(PEER_KEY_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to open key database'));
  });
}

function dbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(new Error('DB get failed'));
  });
}

function dbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('DB put failed'));
  });
}

// ─── Identity Key Pair Management ─────────────────────────────────────

interface StoredIdentityKey {
  id: string; // always 'identity'
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

/**
 * Generates or retrieves the user's ECDH identity key pair.
 * The private key NEVER leaves the client.
 */
export async function getOrCreateIdentityKeyPair(): Promise<CryptoKeyPair> {
  const db = await openKeyDB();

  const stored = await dbGet<StoredIdentityKey>(db, KEY_STORE_NAME, 'identity');
  if (stored) {
    const publicKey = await crypto.subtle.importKey(
      'jwk', stored.publicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true, []
    );
    const privateKey = await crypto.subtle.importKey(
      'jwk', stored.privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, ['deriveBits']
    );
    db.close();
    return { publicKey, privateKey };
  }

  // Generate new identity key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable for storage
    ['deriveBits']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  await dbPut(db, KEY_STORE_NAME, {
    id: 'identity',
    publicKeyJwk,
    privateKeyJwk,
  } as StoredIdentityKey);

  db.close();
  return keyPair;
}

/**
 * Exports the user's public key as a base64-encoded JWK string for server upload.
 */
export async function exportPublicKey(): Promise<string> {
  const keyPair = await getOrCreateIdentityKeyPair();
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return btoa(JSON.stringify(jwk));
}

/**
 * Imports a peer's public key from base64-encoded JWK string.
 */
async function importPeerPublicKey(base64Jwk: string): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(base64Jwk)) as JsonWebKey;
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true, []
  );
}

// ─── Session Key Derivation (ECDH + HKDF) ────────────────────────────

/**
 * Derives a per-conversation AES-GCM-256 key from ECDH shared secret.
 * Uses HKDF with conversation ID as info parameter for domain separation.
 */
async function deriveSessionKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  conversationId: string
): Promise<CryptoKey> {
  // ECDH key agreement → raw shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256
  );

  // Import shared secret as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    'raw', sharedBits, 'HKDF', false, ['deriveKey']
  );

  const encoder = new TextEncoder();

  // HKDF derive → AES-GCM-256 key
  // Info includes conversation ID for domain separation
  // Salt is fixed per protocol version (acceptable for HKDF)
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('relay-e2e-v2-salt'),
      info: encoder.encode(`relay-e2e-v2-conv:${conversationId}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Session Key Cache ────────────────────────────────────────────────

// In-memory cache: conversationId → AES-GCM key
const sessionKeyCache: Map<string, CryptoKey> = new Map();

/**
 * Gets or derives the session key for a conversation with a specific peer.
 * For direct chats: uses the other participant's public key.
 * For group chats: uses each sender's public key (pairwise).
 */
export async function getSessionKey(
  conversationId: string,
  peerPublicKeyBase64: string
): Promise<CryptoKey> {
  const cacheKey = `${conversationId}:${peerPublicKeyBase64.substring(0, 32)}`;

  if (sessionKeyCache.has(cacheKey)) {
    return sessionKeyCache.get(cacheKey)!;
  }

  const identityKeyPair = await getOrCreateIdentityKeyPair();
  const peerPublicKey = await importPeerPublicKey(peerPublicKeyBase64);
  const sessionKey = await deriveSessionKey(
    identityKeyPair.privateKey,
    peerPublicKey,
    conversationId
  );

  sessionKeyCache.set(cacheKey, sessionKey);
  return sessionKey;
}

/**
 * Clears cached session keys (call on logout or key rotation).
 */
export function clearSessionKeys(): void {
  sessionKeyCache.clear();
}

// ─── Encryption / Decryption ──────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts plaintext for a conversation.
 * SECURITY: Throws on failure — NEVER falls back to plaintext.
 *
 * Output format: e2e:v2:<iv_b64>:<ciphertext_b64>
 */
export async function encryptText(
  plaintext: string,
  conversationId: string,
  peerPublicKeyBase64: string
): Promise<string> {
  if (!plaintext) return plaintext;

  // FAIL CLOSED: No try/catch fallback to plaintext
  const key = await getSessionKey(conversationId, peerPublicKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded as BufferSource
  );

  const ivB64 = bufferToBase64(iv.buffer as ArrayBuffer);
  const cipherB64 = bufferToBase64(ciphertext);

  return `${E2E_PREFIX}${ivB64}:${cipherB64}`;
}

/**
 * Decrypts E2EE ciphertext for a conversation.
 * SECURITY: Returns error indicator on failure, never silently returns plaintext.
 */
export async function decryptText(
  encryptedText: string | null | undefined,
  conversationId: string,
  peerPublicKeyBase64: string
): Promise<string> {
  if (!encryptedText) return '';

  // Handle legacy v1 messages (from broken previous implementation)
  if (encryptedText.startsWith('e2e:v1:')) {
    return '[Legacy encrypted message — key migration required]';
  }

  if (!encryptedText.startsWith(E2E_PREFIX)) {
    // Unencrypted legacy message (pre-E2EE)
    return encryptedText;
  }

  const key = await getSessionKey(conversationId, peerPublicKeyBase64);
  const parts = encryptedText.substring(E2E_PREFIX.length).split(':');
  if (parts.length !== 2) {
    return '[Malformed encrypted message]';
  }

  const iv = base64ToBuffer(parts[0]);
  const ciphertext = base64ToBuffer(parts[1]);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    // Decryption failure = tampered ciphertext, wrong key, or replay
    return '[Decryption failed — possible tampering or key mismatch]';
  }
}

/**
 * Encrypts a File before uploading.
 * SECURITY: Throws on failure — NEVER falls back to unencrypted upload.
 */
export async function encryptFile(
  file: File,
  conversationId: string,
  peerPublicKeyBase64: string
): Promise<File> {
  const key = await getSessionKey(conversationId, peerPublicKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const arrayBuffer = await file.arrayBuffer();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    arrayBuffer as BufferSource
  );

  // Prepend 12-byte IV to ciphertext
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  const encryptedBlob = new Blob([combined], { type: 'application/octet-stream' });
  const encFileName = file.name.endsWith('.enc') ? file.name : `${file.name}.enc`;
  return new File([encryptedBlob], encFileName, { type: 'application/octet-stream' });
}

/**
 * Decrypts an encrypted file and creates a Blob URL.
 *
 * ARCH FIX (§12b): The mimeType default changed from 'image/png' to
 * 'application/octet-stream' so that callers who don't pass an explicit type
 * don't silently produce a blob with a wrong MIME type.  All call sites in
 * ChatView now pass the actual content type derived from the file extension /
 * message metadata.
 */
export async function decryptFileToUrl(
  encryptedArrayBuffer: ArrayBuffer,
  conversationId: string,
  peerPublicKeyBase64: string,
  mimeType = 'application/octet-stream'
): Promise<string> {
  const key = await getSessionKey(conversationId, peerPublicKeyBase64);
  const fullArray = new Uint8Array(encryptedArrayBuffer);

  const iv = fullArray.slice(0, 12);
  const ciphertext = fullArray.slice(12);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    const blob = new Blob([decryptedBuffer], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return ''; // Return empty string, UI should show error state
  }
}

/**
 * Checks if a string is E2EE encrypted (v2).
 */
export function isEncrypted(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.startsWith(E2E_PREFIX) || text.startsWith('e2e:v1:');
}

/**
 * Generates a key fingerprint (safety number) for verification.
 * Users can compare fingerprints out-of-band to verify identity.
 */
export async function getKeyFingerprint(publicKeyBase64: string): Promise<string> {
  const keyData = base64ToBuffer(publicKeyBase64);
  const hash = await crypto.subtle.digest('SHA-256', keyData as unknown as BufferSource);
  const bytes = new Uint8Array(hash);
  // Format as groups of 5 digits for readability
  const numbers: string[] = [];
  for (let i = 0; i < bytes.length && numbers.length < 12; i += 2) {
    const val = ((bytes[i] << 8) | bytes[i + 1]) % 100000;
    numbers.push(val.toString().padStart(5, '0'));
  }
  return numbers.join(' ');
}

// ─── TOFU (Trust-On-First-Use) Key Pinning ───────────────────────────
//
// SECURITY FIX (§8): When we first fetch a peer's public key we pin it in
// IndexedDB.  On every subsequent fetch we compare against the pin.  If the
// key has changed we surface a blocking warning and require explicit user
// acknowledgement before deriving a new session key with the new material.
//
// This matches the standard Signal/WhatsApp "safety number" model.  Full
// protection against a *malicious server operator* still requires out-of-band
// verification (compare fingerprints via voice, in person, etc.).  See
// E2EE_SPEC.md for the full threat-model discussion.

export interface PinnedPeerKey {
  /** userId of the peer */
  id: string;
  publicKeyBase64: string;
  firstSeenAt: number; // Date.now()
  /** Set when the user explicitly trusts the current key (either first-use or after a change warning). */
  trustedAt: number;
}

/** Result of checking a peer key against the local TOFU store. */
export type KeyCheckResult =
  | { status: 'trusted'; pinned: PinnedPeerKey }
  | { status: 'first-use'; pinned: PinnedPeerKey }
  | { status: 'changed'; pinned: PinnedPeerKey; newKey: string };

/**
 * SECURITY FIX (§8): Check a peer's public key against the local TOFU pin store.
 *
 * - 'first-use'  — no prior pin; the key has been pinned now (TOFU).
 * - 'trusted'    — key matches the pinned value; all good.
 * - 'changed'    — key differs from the pin; caller MUST surface a warning and
 *                  obtain user acknowledgement before using the new key.
 *
 * @param userId         the peer's user ID
 * @param publicKeyBase64 the key returned by the server this request
 */
export async function checkAndPinPeerKey(
  userId: string,
  publicKeyBase64: string
): Promise<KeyCheckResult> {
  const db = await openKeyDB();
  const existing = await dbGet<PinnedPeerKey>(db, PEER_KEY_STORE_NAME, userId);

  if (!existing) {
    // First time we've seen this user — pin it immediately (TOFU).
    const pinned: PinnedPeerKey = {
      id: userId,
      publicKeyBase64,
      firstSeenAt: Date.now(),
      trustedAt: Date.now(),
    };
    await dbPut(db, PEER_KEY_STORE_NAME, pinned);
    db.close();
    return { status: 'first-use', pinned };
  }

  if (existing.publicKeyBase64 === publicKeyBase64) {
    db.close();
    return { status: 'trusted', pinned: existing };
  }

  // Key has changed — do NOT silently update the pin.  Return 'changed' so the
  // UI can surface a blocking warning.  The pin is NOT updated here; it is only
  // updated when the user explicitly calls trustNewPeerKey().
  db.close();
  return { status: 'changed', pinned: existing, newKey: publicKeyBase64 };
}

/**
 * SECURITY FIX (§8): Called when the user explicitly trusts a new key after seeing
 * the key-change warning.  Updates the TOFU pin and evicts the cached session key
 * so the next message uses the newly trusted key material.
 */
export async function trustNewPeerKey(userId: string, newPublicKeyBase64: string): Promise<void> {
  const db = await openKeyDB();
  const existing = await dbGet<PinnedPeerKey>(db, PEER_KEY_STORE_NAME, userId);

  const pinned: PinnedPeerKey = {
    id: userId,
    publicKeyBase64: newPublicKeyBase64,
    firstSeenAt: existing?.firstSeenAt ?? Date.now(),
    trustedAt: Date.now(),
  };
  await dbPut(db, PEER_KEY_STORE_NAME, pinned);
  db.close();

  // Evict any cached session keys that used the old key material.
  // The cache key contains a prefix of the base64 key, so we clear all entries
  // that start with any conversationId paired with this user's old key prefix.
  // Simplest safe approach: clear the entire session key cache.
  // (Cache is cheap to rebuild — one ECDH derivation per conversation per page load.)
  sessionKeyCache.clear();
}

/**
 * Returns the pinned key record for a peer, or undefined if not yet pinned.
 */
export async function getPinnedPeerKey(userId: string): Promise<PinnedPeerKey | undefined> {
  const db = await openKeyDB();
  const result = await dbGet<PinnedPeerKey>(db, PEER_KEY_STORE_NAME, userId);
  db.close();
  return result;
}

// ─── Group E2EE Fan-Out (§9) ──────────────────────────────────────────
//
// ARCH FIX (§9): Sender-side fan-out encryption for group conversations.
//
// Problem: The original getSessionKey(conversationId, peerPublicKeyBase64) derived
// one AES key from one peer's public key.  In a group with 3+ members, a message
// encrypted for one peer's key was undecryptable by the others.
//
// Solution (pairwise wrapped-key fan-out):
//   1. Generate a random per-message AES-GCM-256 "message key".
//   2. Encrypt the message body once with that message key.
//   3. For each recipient, wrap (encrypt) the message key under the pairwise
//      ECDH session key between sender and that recipient.
//   4. Send the wrapped keys alongside the encrypted body as recipientKeys.
//
// On the receiving side, each recipient:
//   1. Looks up their own wrapped key from recipientKeys[myUserId].
//   2. Unwraps it with their pairwise session key with the sender.
//   3. Decrypts the message body with the unwrapped message key.
//
// For DIRECT (2-person) conversations, this collapses to a single recipient
// entry — no special-casing needed.
//
// This is pairwise-wrapped-key group encryption, NOT MLS/Sender Keys.
// See E2EE_SPEC.md for the full threat-model discussion.

/** Result of group encryption: encrypted body + per-recipient wrapped keys. */
export interface GroupEncryptedMessage {
  /** The message body encrypted with the random per-message key. Format: e2e:v2:<iv>:<ciphertext> */
  encryptedContent: string;
  /** Map of userId → base64-encoded wrapped per-message key. */
  recipientKeys: Record<string, string>;
}

/**
 * ARCH FIX (§9): Encrypts a plaintext message for a group conversation.
 *
 * @param plaintext       the message text to encrypt
 * @param conversationId  the conversation ID (used for HKDF domain separation)
 * @param recipients      array of { userId, publicKeyBase64 } for every member EXCEPT the sender
 * @returns encrypted body + per-recipient wrapped keys
 */
export async function encryptMessageForGroup(
  plaintext: string,
  conversationId: string,
  recipients: Array<{ userId: string; publicKeyBase64: string }>
): Promise<GroupEncryptedMessage> {
  if (!plaintext) {
    return { encryptedContent: plaintext, recipientKeys: {} };
  }

  // Step 1: Generate a random per-message AES-GCM-256 key.
  const messageKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can export and wrap it
    ['encrypt', 'decrypt']
  );

  // Step 2: Encrypt the message body with the message key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    messageKey,
    encoded as BufferSource
  );
  const ivB64 = bufferToBase64(iv.buffer as ArrayBuffer);
  const cipherB64 = bufferToBase64(ciphertext);
  const encryptedContent = `${E2E_PREFIX}${ivB64}:${cipherB64}`;

  // Step 3: Export the raw message key bytes.
  const rawMessageKey = await crypto.subtle.exportKey('raw', messageKey);

  // Step 4: For each recipient, wrap the message key with their pairwise session key.
  const identityKeyPair = await getOrCreateIdentityKeyPair();
  const recipientKeys: Record<string, string> = {};

  for (const recipient of recipients) {
    const peerPublicKey = await importPeerPublicKey(recipient.publicKeyBase64);
    const sessionKey = await deriveSessionKey(
      identityKeyPair.privateKey,
      peerPublicKey,
      conversationId
    );

    // Wrap: encrypt the raw message key bytes with the pairwise session key.
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrappedKeyBytes = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv as BufferSource },
      sessionKey,
      rawMessageKey as BufferSource
    );

    // Encode as iv:ciphertext so the recipient can unwrap.
    const wrapIvB64 = bufferToBase64(wrapIv.buffer as ArrayBuffer);
    const wrappedB64 = bufferToBase64(wrappedKeyBytes);
    recipientKeys[recipient.userId] = `${wrapIvB64}:${wrappedB64}`;
  }

  return { encryptedContent, recipientKeys };
}

/**
 * ARCH FIX (§9): Decrypts a group-encrypted message.
 *
 * @param encryptedText      the encrypted message body (e2e:v2:... format)
 * @param conversationId     conversation ID
 * @param senderPublicKeyB64 the sender's public key (to derive the pairwise session key)
 * @param myWrappedKey       the current user's wrapped key from recipientKeys[myUserId]
 * @returns decrypted plaintext, or an error indicator string
 */
export async function decryptGroupMessage(
  encryptedText: string | null | undefined,
  conversationId: string,
  senderPublicKeyB64: string,
  myWrappedKey: string | undefined | null
): Promise<string> {
  if (!encryptedText) return '';

  // Handle legacy v1 messages.
  if (encryptedText.startsWith('e2e:v1:')) {
    return '[Legacy encrypted message — key migration required]';
  }

  // Unencrypted legacy message (pre-E2EE).
  if (!encryptedText.startsWith(E2E_PREFIX)) {
    return encryptedText;
  }

  // If there's no wrapped key for this user, fall back to direct pairwise decryption
  // (backward compatibility with messages sent before §9 fan-out was deployed).
  if (!myWrappedKey) {
    return decryptText(encryptedText, conversationId, senderPublicKeyB64);
  }

  try {
    // Step 1: Derive the pairwise session key with the sender.
    const identityKeyPair = await getOrCreateIdentityKeyPair();
    const senderPublicKey = await importPeerPublicKey(senderPublicKeyB64);
    const sessionKey = await deriveSessionKey(
      identityKeyPair.privateKey,
      senderPublicKey,
      conversationId
    );

    // Step 2: Unwrap the per-message key.
    const wrapParts = myWrappedKey.split(':');
    if (wrapParts.length !== 2) {
      return '[Malformed wrapped key]';
    }
    const wrapIv = base64ToBuffer(wrapParts[0]);
    const wrappedKeyBytes = base64ToBuffer(wrapParts[1]);

    const rawMessageKeyBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: wrapIv as BufferSource },
      sessionKey,
      wrappedKeyBytes as BufferSource
    );

    // Step 3: Import the unwrapped message key.
    const messageKey = await crypto.subtle.importKey(
      'raw',
      rawMessageKeyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Step 4: Decrypt the message body with the message key.
    const bodyParts = encryptedText.substring(E2E_PREFIX.length).split(':');
    if (bodyParts.length !== 2) {
      return '[Malformed encrypted message]';
    }
    const bodyIv = base64ToBuffer(bodyParts[0]);
    const bodyCiphertext = base64ToBuffer(bodyParts[1]);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bodyIv as BufferSource },
      messageKey,
      bodyCiphertext as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    return '[Decryption failed — possible tampering or key mismatch]';
  }
}

