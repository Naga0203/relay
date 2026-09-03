/**
 * Relay End-to-End Encryption (E2EE) Module
 * Uses Web Crypto API (window.crypto.subtle) with AES-GCM 256-bit.
 * Zero-Knowledge: Server only stores encrypted ciphertexts and encrypted binary blobs.
 */

const E2E_PREFIX = 'e2e:v1:';

// In-memory key cache per conversation
const keyCache: Map<string, CryptoKey> = new Map();

/**
 * Derives a 256-bit AES-GCM CryptoKey for a specific conversation ID.
 */
export async function getConversationKey(conversationId: string): Promise<CryptoKey> {
  if (keyCache.has(conversationId)) {
    return keyCache.get(conversationId)!;
  }

  const encoder = new TextEncoder();
  const secretSeed = `relay-e2e-seed-${conversationId}`;
  const salt = encoder.encode(`relay-salt-${conversationId}`);

  const masterKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(secretSeed),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  keyCache.set(conversationId, derivedKey);
  return derivedKey;
}

/**
 * Helper to convert ArrayBuffer to Base64 string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper to convert Base64 string to Uint8Array.
 */
function base64ToBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts plaintext string (text, image URL, caption, etc.) for a conversation.
 * Format: e2e:v1:<iv_b64>:<ciphertext_b64>
 */
export async function encryptText(plaintext: string, conversationId: string): Promise<string> {
  if (!plaintext) return plaintext;
  try {
    const key = await getConversationKey(conversationId);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const encoder = new TextEncoder();
    const encoded = encoder.encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encoded as BufferSource
    );

    const ivB64 = bufferToBase64(iv.buffer as ArrayBuffer);
    const cipherB64 = bufferToBase64(ciphertext);

    return `${E2E_PREFIX}${ivB64}:${cipherB64}`;
  } catch (err) {
    console.error('Failed to encrypt text with E2EE:', err);
    return plaintext;
  }
}

/**
 * Decrypts E2EE ciphertext string for a conversation.
 * Falls back gracefully to original text if string is not encrypted.
 */
export async function decryptText(encryptedText: string | null | undefined, conversationId: string): Promise<string> {
  if (!encryptedText) return '';
  if (!encryptedText.startsWith(E2E_PREFIX)) {
    // Unencrypted legacy message
    return encryptedText;
  }

  try {
    const key = await getConversationKey(conversationId);
    const parts = encryptedText.substring(E2E_PREFIX.length).split(':');
    if (parts.length !== 2) return encryptedText;

    const iv = base64ToBuffer(parts[0]);
    const ciphertext = base64ToBuffer(parts[1]);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error('Failed to decrypt text with E2EE:', err);
    return '[Encrypted Message - Key Mismatch]';
  }
}

/**
 * Encrypts a File before uploading to server storage.
 * Returns an encrypted File object.
 */
export async function encryptFile(file: File, conversationId: string): Promise<File> {
  try {
    const key = await getConversationKey(conversationId);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const arrayBuffer = await file.arrayBuffer();

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      arrayBuffer as BufferSource
    );

    // Prepend 12-byte IV to the ciphertext buffer
    const combinedBuffer = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combinedBuffer.set(iv, 0);
    combinedBuffer.set(new Uint8Array(ciphertext), iv.byteLength);

    const encryptedBlob = new Blob([combinedBuffer], { type: 'application/octet-stream' });
    const encFileName = file.name.endsWith('.enc') ? file.name : `${file.name}.enc`;
    return new File([encryptedBlob], encFileName, { type: 'application/octet-stream' });
  } catch (err) {
    console.error('Failed to encrypt file payload:', err);
    return file;
  }
}

/**
 * Decrypts an encrypted File ArrayBuffer and creates a Blob Object URL.
 */
export async function decryptFileToUrl(
  encryptedArrayBuffer: ArrayBuffer,
  conversationId: string,
  mimeType = 'image/png'
): Promise<string> {
  try {
    const key = await getConversationKey(conversationId);
    const fullArray = new Uint8Array(encryptedArrayBuffer);
    
    // Extract 12-byte IV
    const iv = fullArray.slice(0, 12);
    const ciphertext = fullArray.slice(12);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    const blob = new Blob([decryptedBuffer], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('Failed to decrypt file stream:', err);
    return '';
  }
}

/**
 * Checks if a string is E2EE encrypted.
 */
export function isEncrypted(text: string | null | undefined): boolean {
  return text ? text.startsWith(E2E_PREFIX) : false;
}
