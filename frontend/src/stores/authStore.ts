import { create } from 'zustand';
import type { User } from '../types';
import { exportPublicKey, clearSessionKeys } from '../lib/e2eCrypto';
import { userApi } from '../features/profile/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  loadFromStorage: () => boolean;
  /**
   * ARCH FIX (§12c): New action called by the axios interceptor after a silent
   * token refresh.  Routing the update through the store keeps in-memory state
   * (isAuthenticated, future per-session flags) in sync with localStorage.
   * Previously the interceptor wrote directly to localStorage without touching
   * Zustand, so any subscriber watching store state would see stale tokens.
   */
  updateTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) => set({ user }),

  login: (accessToken, refreshToken, user) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });

    // E2EE: Generate key pair and upload public key to server
    // This is async but we don't block the login flow on it
    exportPublicKey()
      .then((pubKey) => userApi.uploadPublicKey(pubKey))
      .catch(() => {
        // Key upload failure is non-fatal but should be retried
      });
  },

  // ARCH FIX (§12c): Token refresh updates both localStorage AND Zustand state
  // so in-memory and persisted state can never diverge.
  updateTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    // isAuthenticated stays true; user object is unchanged.
    // Explicitly call set() so any future state that depends on token presence
    // (e.g. an `accessToken` field added later) is also updated here.
    set((s) => ({ ...s }));
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    // Clear E2EE session key cache on logout
    clearSessionKeys();
    set({ user: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const parsed = JSON.parse(userStr);
        if (
          typeof parsed === 'object' && parsed !== null &&
          typeof parsed.id === 'string' &&
          typeof parsed.name === 'string' &&
          typeof parsed.email === 'string'
        ) {
          const user = parsed as User;
          set({ user, isAuthenticated: true });

          // Re-upload public key on session restore (ensures key is synced)
          exportPublicKey()
            .then((pubKey) => userApi.uploadPublicKey(pubKey))
            .catch(() => {});

          return true;
        }
      } catch { /* ignore */ }
    }
    return false;
  },
}));
