import { useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen image overlay.
 *
 * SECURITY FIX (§5): The "Open Original" button that used to do
 *   <a href={src} target="_blank" rel="noopener noreferrer">
 * has been removed.  That link navigated to the raw file URL as a top-level
 * same-origin document.  Because SVG (and potentially other content types) can
 * contain <script> tags, that navigation would have executed attacker-controlled
 * JavaScript in the relay app's origin, allowing exfiltration of access tokens /
 * refresh tokens / E2EE private keys from localStorage and IndexedDB.
 *
 * The only action now available is "Download", which uses the `download` attribute
 * to trigger a save-dialog rather than navigation.  For blob: URLs (already-decrypted
 * images held in memory) the browser will honour the download attribute directly.
 * For same-origin /api/v1/files/ URLs the server now also responds with
 * Content-Disposition: attachment for non-image types (FileController fix), providing
 * defence-in-depth even if someone finds another way to trigger navigation.
 */
export function ImageLightbox({ src, alt = 'Media', onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      {/* Top Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {/* SECURITY FIX (§5): download-only — no target="_blank" navigation to user content */}
        <a
          href={src}
          download="relay_image.png"
          onClick={(e) => e.stopPropagation()}
          title="Download image"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image Display */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center relative"
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        />
      </div>
    </div>
  );
}
