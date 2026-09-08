import { create } from 'zustand';
import { trustNewPeerKey } from '../lib/e2eCrypto';

/**
 * SECURITY FIX (§8): Global store that tracks pending key-change warnings.
 *
 * When ChatView detects that a peer's public key has changed (via checkAndPinPeerKey
 * returning 'changed'), it inserts a record here.  The UI renders a blocking,
 * non-dismissible-by-default banner.  Encryption is halted for that peer until the
 * user explicitly acknowledges ("Trust new key" or "I've verified this is still [Name]").
 *
 * Multiple conversations with the same peer share one warning entry (keyed by userId).
 */

export interface KeyChangeWarning {
  userId: string;
  userName: string;
  oldKeyBase64: string;
  newKeyBase64: string;
  detectedAt: number;
}

interface KeyVerificationState {
  /** Map of userId → pending warning (requires user acknowledgement). */
  pendingWarnings: Record<string, KeyChangeWarning>;

  /** Record a newly detected key change. */
  addWarning: (warning: KeyChangeWarning) => void;

  /**
   * User has explicitly acknowledged and trusts the new key.
   * Updates the TOFU pin store and removes the warning.
   */
  trustNewKey: (userId: string) => Promise<void>;

  /** Whether a given userId has a pending unacknowledged key-change warning. */
  hasWarning: (userId: string) => boolean;
}

export const useKeyVerificationStore = create<KeyVerificationState>((set, get) => ({
  pendingWarnings: {},

  addWarning: (warning) =>
    set((state) => ({
      pendingWarnings: { ...state.pendingWarnings, [warning.userId]: warning },
    })),

  trustNewKey: async (userId) => {
    const warning = get().pendingWarnings[userId];
    if (!warning) return;

    // SECURITY FIX (§8): Update the IndexedDB TOFU pin and evict cached session keys.
    await trustNewPeerKey(userId, warning.newKeyBase64);

    set((state) => {
      const updated = { ...state.pendingWarnings };
      delete updated[userId];
      return { pendingWarnings: updated };
    });
  },

  hasWarning: (userId) => !!get().pendingWarnings[userId],
}));
