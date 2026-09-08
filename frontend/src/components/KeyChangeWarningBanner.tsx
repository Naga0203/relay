import { useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useKeyVerificationStore } from '../stores/keyVerificationStore';
import { getKeyFingerprint } from '../lib/e2eCrypto';

interface Props {
  userId: string;
  userName: string;
}

/**
 * SECURITY FIX (§8): Non-dismissible key-change warning banner.
 *
 * Rendered inside ChatView whenever checkAndPinPeerKey returns 'changed' for
 * the current peer.  The user must explicitly acknowledge before the chat
 * becomes interactive again.  This matches the Signal / WhatsApp safety-number
 * change notification pattern.
 *
 * Accessible: uses role="alert" so screen readers announce it immediately.
 */
export function KeyChangeWarningBanner({ userId, userName }: Props) {
  const warning    = useKeyVerificationStore((s) => s.pendingWarnings[userId]);
  const trustNewKey = useKeyVerificationStore((s) => s.trustNewKey);
  const [showFingerprints, setShowFingerprints] = useState(false);
  const [oldFp, setOldFp] = useState<string>('');
  const [newFp, setNewFp] = useState<string>('');
  const [trusting, setTrusting] = useState(false);

  if (!warning) return null;

  const handleShowFingerprints = async () => {
    const [o, n] = await Promise.all([
      getKeyFingerprint(warning.oldKeyBase64),
      getKeyFingerprint(warning.newKeyBase64),
    ]);
    setOldFp(o);
    setNewFp(n);
    setShowFingerprints(true);
  };

  const handleTrust = async () => {
    setTrusting(true);
    await trustNewKey(userId);
    // Store update removes the warning; component unmounts automatically.
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mx-4 my-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-amber-300">
            ⚠️ {userName}'s security key changed
          </p>
          <p className="text-xs text-amber-200/70 mt-0.5 leading-relaxed">
            The encryption key for this contact is different from the one you previously
            verified. This could mean they reinstalled the app — or it could indicate a
            security issue. Verify before continuing.
          </p>
        </div>
      </div>

      {/* Fingerprint comparison */}
      {showFingerprints && (
        <div className="rounded-lg bg-dark-800 border border-dark-600 p-3 space-y-2">
          <div>
            <p className="text-[10px] text-dark-400 font-medium uppercase tracking-wide mb-1">
              Previous security code
            </p>
            <p className="font-mono text-xs text-red-400 break-all">{oldFp}</p>
          </div>
          <div>
            <p className="text-[10px] text-dark-400 font-medium uppercase tracking-wide mb-1">
              New security code
            </p>
            <p className="font-mono text-xs text-emerald-400 break-all">{newFp}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {!showFingerprints && (
          <button
            onClick={handleShowFingerprints}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-xs text-white transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Compare security codes
          </button>
        )}
        <button
          onClick={handleTrust}
          disabled={trusting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-xs text-amber-200 transition-colors disabled:opacity-50"
        >
          {trusting ? 'Trusting…' : `I've verified — trust new key`}
        </button>
      </div>
    </div>
  );
}
