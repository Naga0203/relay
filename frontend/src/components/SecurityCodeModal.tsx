import { useState, useEffect } from 'react';
import { ShieldCheck, X, Copy, Check } from 'lucide-react';
import { getKeyFingerprint, exportPublicKey } from '../lib/e2eCrypto';

interface Props {
  /** The peer's display name */
  peerName: string;
  /** The peer's public key (base64 JWK) — fetched by the caller */
  peerPublicKeyBase64: string;
  onClose: () => void;
}

/**
 * SECURITY FIX (§8): "View Security Code" modal.
 *
 * Displays the SHA-256 fingerprint of both the current user's key and the peer's key
 * as 12 groups of 5 digits — the standard "safety number" pattern used by Signal and
 * WhatsApp.  Users can compare these out-of-band (voice call, in person) to verify
 * that the server has not swapped a key.
 *
 * Accessible via the "End-to-End Encrypted" badge in the ChatView header.
 */
export function SecurityCodeModal({ peerName, peerPublicKeyBase64, onClose }: Props) {
  const [myFingerprint, setMyFingerprint]     = useState<string>('');
  const [peerFingerprint, setPeerFingerprint] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [myKey, peerFp] = await Promise.all([
        exportPublicKey(),
        getKeyFingerprint(peerPublicKeyBase64),
      ]);
      const myFp = await getKeyFingerprint(myKey);
      if (mounted) {
        setMyFingerprint(myFp);
        setPeerFingerprint(peerFp);
      }
    }
    load();
    return () => { mounted = false; };
  }, [peerPublicKeyBase64]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const combinedCode = [myFingerprint, peerFingerprint].join('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(combinedCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const FingerprintBlock = ({ label, fp }: { label: string; fp: string }) => (
    <div className="rounded-xl bg-dark-800 border border-dark-600 p-4">
      <p className="text-xs text-dark-400 mb-2 font-medium uppercase tracking-wide">{label}</p>
      {fp ? (
        <p className="font-mono text-sm text-emerald-400 leading-relaxed tracking-widest break-all">
          {fp}
        </p>
      ) : (
        <div className="h-8 bg-dark-700 animate-pulse rounded" />
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-850 border border-dark-600 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-code-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <h2 id="security-code-title" className="text-base font-semibold text-white">
              Security Code
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explanation */}
        <p className="text-sm text-dark-300 leading-relaxed">
          To verify your conversation with{' '}
          <span className="text-white font-medium">{peerName}</span> is secure, compare
          these codes with them in person or over a phone call. They should be identical
          on both devices.
        </p>

        {/* Fingerprints */}
        <div className="space-y-3">
          <FingerprintBlock label="Your security code" fp={myFingerprint} />
          <FingerprintBlock label={`${peerName}'s security code`} fp={peerFingerprint} />
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dark-600 bg-dark-800 hover:bg-dark-700 text-sm text-dark-200 transition-colors"
        >
          {copied ? (
            <><Check className="w-4 h-4 text-emerald-400" /> Copied</>
          ) : (
            <><Copy className="w-4 h-4" /> Copy both codes</>
          )}
        </button>

        <p className="text-[11px] text-dark-500 text-center leading-relaxed">
          Security codes use SHA-256 fingerprints of ECDH P-256 public keys.
          Verification is manual — no automatic out-of-band channel exists.
        </p>
      </div>
    </div>
  );
}
