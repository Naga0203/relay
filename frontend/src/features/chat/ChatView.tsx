import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messageApi } from './api';
import { conversationApi } from '../conversations/api';
import { useAuthStore } from '../../stores/authStore';
import type { Conversation, Message, SendMessageRequest } from '../../types';
import { Send, Loader2, ArrowDown, Smile, Image as ImageIcon, Film, Link as LinkIcon, ShieldCheck, ShieldAlert, Lock, Download, FileText } from 'lucide-react';
import { EmojiPicker } from '../../components/EmojiPicker';
import { GifPicker } from '../../components/GifPicker';
import { MediaUploadModal } from '../../components/MediaUploadModal';
import { ImageLightbox } from '../../components/ImageLightbox';
import { SecurityCodeModal } from '../../components/SecurityCodeModal';
import { KeyChangeWarningBanner } from '../../components/KeyChangeWarningBanner';
import { userApi } from '../profile/api';
import {
  decryptText,
  decryptFileToUrl,
  decryptFileForGroup,
  isEncrypted,
  checkAndPinPeerKey,
  encryptMessageForGroup,
  decryptGroupMessage,
  exportPublicKey,
  detectMimeType,
  detectFileExtension,
  isImageMimeType,
  isVideoMimeType,
} from '../../lib/e2eCrypto';
import { useKeyVerificationStore } from '../../stores/keyVerificationStore';

interface Props {
  conversationId: string;
  conversations: Conversation[];
}

interface DecryptedItemProps {
  msg: Message;
  conversationId: string;
  senderPublicKey: string;
  peerPublicKey: string;
  peerUserId?: string;
  isOwn: boolean;
  formatTime: (iso: string) => string;
  setLightboxSrc: (src: string) => void;
}

/**
 * Returns display info for a file based on its MIME type, used for the generic file card.
 */
function getFileInfoFromMime(mimeType: string, fileUrl: string) {
  const ext = detectFileExtension(fileUrl).replace('.', '').toUpperCase();
  const fileName = fileUrl.split('/').pop()?.replace('.enc', '') || 'download';

  // Pick icon based on MIME type
  let icon = FileText;
  let sizeLabel = ext || 'File';

  if (mimeType.startsWith('image/')) icon = ImageIcon;
  else if (mimeType.startsWith('video/')) icon = Film;
  else if (mimeType === 'application/pdf') { icon = FileText; sizeLabel = 'PDF'; }
  else if (mimeType.includes('word') || mimeType === 'application/msword') { icon = FileText; sizeLabel = 'Word'; }
  else if (mimeType.includes('spreadsheet') || mimeType === 'application/vnd.ms-excel') { icon = FileText; sizeLabel = 'Excel'; }
  else if (mimeType.includes('presentation') || mimeType === 'application/vnd.ms-powerpoint') { icon = FileText; sizeLabel = 'PowerPoint'; }
  else if (mimeType === 'application/zip' || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar') || mimeType.includes('gzip')) {
    icon = FileText; sizeLabel = 'Archive';
  }
  else if (mimeType === 'application/vnd.android.package-archive') { icon = FileText; sizeLabel = 'APK'; }
  else { sizeLabel = ext || 'File'; }

  return { icon, name: fileName, sizeLabel };
}

/**
 * Sub-component for rendering single decrypted E2EE messages and attachments.
 */
function DecryptedMessageItem({
  msg,
  conversationId,
  senderPublicKey,
  peerPublicKey,
  peerUserId,
  isOwn,
  formatTime,
  setLightboxSrc,
}: DecryptedItemProps) {
  const [decryptedText, setDecryptedText] = useState<string>('');
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<boolean>(false);
  const [gifError, setGifError] = useState<boolean>(false);

  const encrypted = isEncrypted(msg.content);

  // ARCH FIX (§9): Use group decryption when recipientKeys are present on the message.
  // Unwraps using the message sender's public key (senderPublicKey).
  // Falls back to legacy pairwise decryptText for older messages without wrapped keys.
  useEffect(() => {
    let isMounted = true;
    async function performDecrypt() {
      if (!msg.content) {
        setDecryptedText('');
        return;
      }
      // Determine the current user's wrapped key (if available).
      const currentUserId = useAuthStore.getState().user?.id ?? '';
      const myWrappedKey = msg.recipientKeys?.[currentUserId] ?? null;
      let plain: string;
      if (myWrappedKey) {
        let activeSenderKey = senderPublicKey;
        if (!activeSenderKey) {
          try {
            const keyRes = await userApi.getPublicKey(msg.senderId);
            activeSenderKey = keyRes?.publicKey || '';
          } catch { /* ignore */ }
        }
        // §9 fan-out decryption path: derive pairwise key with the message sender
        plain = await decryptGroupMessage(msg.content, conversationId, activeSenderKey, myWrappedKey, currentUserId);
      } else if (msg.recipientKeys && Object.keys(msg.recipientKeys).length > 0) {
        // Message was encrypted with fan-out keys, but this user was not included in recipients
        plain = '[Message was not encrypted for this account — sender sent before your encryption keys were available]';
      } else {
        // Legacy pairwise decryption path:
        // For pairwise, derive with the other party's key (peer for own messages, sender for incoming)
        let fallbackKey = isOwn ? peerPublicKey : senderPublicKey;
        if (!fallbackKey) {
          try {
            const targetId = isOwn ? peerUserId : msg.senderId;
            if (targetId) {
              const res = await userApi.getPublicKey(targetId);
              fallbackKey = res?.publicKey || '';
            }
          } catch { /* ignore */ }
        }
        plain = await decryptText(msg.content, conversationId, fallbackKey, currentUserId);
      }
      if (isMounted) {
        setDecryptedText(plain);
      }
    }
    performDecrypt();
    return () => {
      isMounted = false;
    };
  }, [msg.content, conversationId, senderPublicKey, peerPublicKey, msg.recipientKeys, isOwn, msg.senderId, peerUserId]);

  const lines = decryptedText.split('\n');
  const firstLine = lines[0] || '';
  const restLines = lines.slice(1).join('\n');

  const isImgUrl = (url: string) => {
    const mime = detectMimeType(url);
    return isImageMimeType(mime) ||
      url.includes('giphy.com/media') ||
      url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) != null;
  };

  const isVideoUrl = (url: string) => {
    const mime = detectMimeType(url);
    return isVideoMimeType(mime) ||
      url.match(/\.(mp4|webm|mov|avi)($|\?)/i) != null;
  };

  // Handle encrypted file payload fetch & local decryption
  useEffect(() => {
    let isMounted = true;
    if (!firstLine || !firstLine.includes('/api/v1/files/')) return;

    let blobUrl: string | null = null;

    if (firstLine.endsWith('.enc') || firstLine.includes('/api/v1/files/')) {
      setLoadingMedia(true);

      // FIX (§12d): Download via the axios instance instead of raw fetch().
      // The axios response interceptor handles JWT token refresh automatically,
      // so file downloads after token expiry no longer fail with 401.
      messageApi.downloadFile(firstLine)
        .then(async (buffer) => {
          if (!isMounted) return;
          const detectedMime = detectMimeType(firstLine);

          const currentUserId = useAuthStore.getState().user?.id ?? '';
          const myWrappedFileKey = msg.recipientKeys?.[currentUserId] ?? null;

          // ARCH FIX (§9): If this is a group-encrypted message (recipientKeys present),
          // use the wrapped per-file key to decrypt. Otherwise fall back to pairwise
          // decryption (backward compatibility with messages sent before §9 fan-out).
          //
          // Backward-compat note: old-format messages (pre-§9) were encrypted with
          // encryptFile() (pairwise ECDH) but may still carry recipientKeys from
          // encryptMessageForGroup() (which wraps a DIFFERENT per-message key, not
          // the file key). decryptFileForGroup() will fail on those — so we try
          // the group path first, then gracefully fall back to pairwise decryption.
          if (myWrappedFileKey && senderPublicKey) {
            // Try group fan-out decryption first (new unified format)
            let url = await decryptFileForGroup(
              buffer, conversationId, senderPublicKey, myWrappedFileKey, detectedMime, currentUserId
            );
            if (!isMounted) return;

            // Fall back to pairwise decryption if group decryption failed
            // (legacy messages where file was encrypted with pairwise ECDH key)
            if (!url) {
              let fileDecryptKey = isOwn ? peerPublicKey : senderPublicKey;
              if (!fileDecryptKey) {
                try {
                  const targetId = isOwn ? peerUserId : msg.senderId;
                  if (targetId) {
                    const res = await userApi.getPublicKey(targetId);
                    fileDecryptKey = res?.publicKey || '';
                  }
                } catch { /* ignore */ }
              }
              url = await decryptFileToUrl(buffer, conversationId, fileDecryptKey, detectedMime, currentUserId);
            }

            if (!isMounted) return;
            if (url) {
              blobUrl = url;
              setMediaBlobUrl(url);
            } else {
              setMediaBlobUrl(null);
            }
          } else {
            // No recipientKeys → pairwise decryption (legacy / direct chat)
            let fileDecryptKey = isOwn ? peerPublicKey : senderPublicKey;
            if (!fileDecryptKey) {
              try {
                const targetId = isOwn ? peerUserId : msg.senderId;
                if (targetId) {
                  const res = await userApi.getPublicKey(targetId);
                  fileDecryptKey = res?.publicKey || '';
                }
              } catch { /* ignore */ }
            }
            const url = await decryptFileToUrl(buffer, conversationId, fileDecryptKey, detectedMime, currentUserId);

            if (!isMounted) return;
            if (url) {
              blobUrl = url;
              setMediaBlobUrl(url);
            } else {
              setMediaBlobUrl(null);
            }
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          // Token refresh failure → redirect to login (axios interceptor already logged out)
          if (err?.response?.status === 401 || err?.message?.includes('AUTH_EXPIRED')) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
          } else {
            setMediaBlobUrl(null);
            setMediaError(true);
          }
        })
        .finally(() => {
          if (isMounted) setLoadingMedia(false);
        });
    } else {
      setMediaBlobUrl(firstLine);
    }

    return () => {
      isMounted = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [firstLine, conversationId, senderPublicKey, peerPublicKey, isOwn, msg.senderId, peerUserId, msg.recipientKeys]);

  const renderBody = () => {
    if (msg.deleted) {
      return <span className="italic text-dark-400">Message deleted</span>;
    }

    if (!decryptedText && msg.content) {
      return <Loader2 className="w-4 h-4 animate-spin text-dark-400" />;
    }

    // Decryption failure / warning message
    if (firstLine.startsWith('[') && firstLine.endsWith(']')) {
      return (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 my-1 max-w-sm">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{firstLine.slice(1, -1)}</span>
        </div>
      );
    }

    // IMAGE message type or direct image link
    if (
      msg.messageType === 'IMAGE' ||
      (msg.messageType === 'TEXT' && isImgUrl(firstLine) && !firstLine.includes('giphy.com'))
    ) {
      const isEncryptedFile = firstLine.includes('.enc') || firstLine.includes('/api/v1/files/');
      const displaySrc = mediaBlobUrl || (isEncryptedFile ? null : firstLine);
      const isMediaLoading = loadingMedia || (isEncryptedFile && !mediaBlobUrl && !mediaError);
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            className={`group relative max-w-sm rounded-xl overflow-hidden bg-dark-800 border transition-all shadow-md ${
              isMediaLoading || mediaError
                ? 'border-dark-600/50 cursor-default'
                : 'border-dark-600/50 hover:border-primary-500/50 cursor-pointer hover:shadow-lg'
            }`}
          >
            {isMediaLoading ? (
              <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                <span>Decrypting E2EE Media...</span>
              </div>
            ) : mediaError || !displaySrc ? (
              <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2 p-4 text-center">
                <ImageIcon className="w-6 h-6 text-danger-500/70" />
                <span className="font-medium text-dark-300">Unable to load media preview</span>
                <span className="text-[10px] text-dark-500">File could not be decrypted or loaded</span>
              </div>
            ) : (
              <>
                <img
                  src={displaySrc}
                  alt="E2EE Attachment"
                  className="w-full max-h-72 object-cover rounded-xl transition-transform duration-200"
                  loading="lazy"
                  onError={() => {
                    setMediaError(true);
                  }}
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
                  Click to enlarge 🔍
                </div>
              </>
            )}
            {!isMediaLoading && !mediaError && displaySrc && (
              <div
                onClick={() => setLightboxSrc(displaySrc)}
                className="absolute inset-0 cursor-pointer"
              />
            )}
          </div>
          {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
        </div>
      );
    }

    // VIDEO file or direct video link
    if (
      ((msg.messageType === 'FILE' || msg.messageType === 'TEXT') && isVideoUrl(firstLine) && !firstLine.includes('giphy.com'))
    ) {
      const isEncryptedFile = firstLine.includes('.enc') || firstLine.includes('/api/v1/files/');
      const displaySrc = mediaBlobUrl || (isEncryptedFile ? null : firstLine);
      const isMediaLoading = loadingMedia || (isEncryptedFile && !mediaBlobUrl && !mediaError);
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            className={`group relative max-w-sm rounded-xl overflow-hidden bg-dark-800 border transition-all shadow-md ${
              isMediaLoading || mediaError
                ? 'border-dark-600/50 cursor-default'
                : 'border-dark-600/50 hover:border-primary-500/50 cursor-pointer hover:shadow-lg'
            }`}
          >
            {isMediaLoading ? (
              <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                <span>Decrypting E2EE Media...</span>
              </div>
            ) : mediaError || !displaySrc ? (
              <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2 p-4 text-center">
                <Film className="w-6 h-6 text-danger-500/70" />
                <span className="font-medium text-dark-300">Unable to load video preview</span>
                <span className="text-[10px] text-dark-500">File could not be decrypted or loaded</span>
              </div>
            ) : (
              <video
                src={displaySrc}
                controls
                className="w-full max-h-72 object-cover rounded-xl transition-transform duration-200"
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  video.muted = true; // mute for autoplay safety
                }}
              />
            )}
            {!isMediaLoading && !mediaError && displaySrc && (
              <div
                onClick={() => setLightboxSrc(displaySrc)}
                className="absolute inset-0 cursor-pointer"
              />
            )}
          </div>
          {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
        </div>
      );
    }

    // FILE message type (PDF, DOC, XLS, PPT, archives, etc.)
    if (
      msg.messageType === 'FILE' ||
      (msg.messageType === 'TEXT' && firstLine.includes('/api/v1/files/') && !isImgUrl(firstLine) && !isVideoUrl(firstLine))
    ) {
      const isEncryptedFile = firstLine.includes('.enc') || firstLine.includes('/api/v1/files/');
      const fileUrl = mediaBlobUrl || (isEncryptedFile ? null : firstLine);
      const isMediaLoading = loadingMedia || (isEncryptedFile && !mediaBlobUrl && !mediaError);
      const mimeType = detectMimeType(firstLine);
      const isImage = isImageMimeType(mimeType);
      const isVideo = isVideoMimeType(mimeType);

      // If the decrypted blob is actually an image or video, render inline
      if (isImage) {
        return (
          <div className="space-y-1.5 my-0.5">
            <div
              className={`group relative max-w-sm rounded-xl overflow-hidden bg-dark-800 border transition-all shadow-md ${
                isMediaLoading || mediaError
                  ? 'border-dark-600/50 cursor-default'
                  : 'border-dark-600/50 hover:border-primary-500/50 cursor-pointer hover:shadow-lg'
              }`}
            >
              {isMediaLoading ? (
                <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                  <span>Decrypting E2EE Media...</span>
                </div>
              ) : mediaError || !fileUrl ? (
                <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2 p-4 text-center">
                  <ImageIcon className="w-6 h-6 text-danger-500/70" />
                  <span className="font-medium text-dark-300">Unable to load media preview</span>
                  <span className="text-[10px] text-dark-500">File could not be decrypted or loaded</span>
                </div>
              ) : (
                <>
                  <img
                    src={fileUrl}
                    alt="E2EE Attachment"
                    className="w-full max-h-72 object-cover rounded-xl transition-transform duration-200"
                    loading="lazy"
                    onError={() => setMediaError(true)}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
                    Click to enlarge 🔍
                  </div>
                </>
              )}
              {!isMediaLoading && !mediaError && fileUrl && (
                <div
                  onClick={() => setLightboxSrc(fileUrl)}
                  className="absolute inset-0 cursor-pointer"
                />
              )}
            </div>
            {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
          </div>
        );
      }

      if (isVideo) {
        return (
          <div className="space-y-1.5 my-0.5">
            <div
              className={`group relative max-w-sm rounded-xl overflow-hidden bg-dark-800 border transition-all shadow-md ${
                isMediaLoading || mediaError
                  ? 'border-dark-600/50 cursor-default'
                  : 'border-dark-600/50 hover:border-primary-500/50 cursor-pointer hover:shadow-lg'
              }`}
            >
              {isMediaLoading ? (
                <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                  <span>Decrypting E2EE Media...</span>
                </div>
              ) : mediaError || !fileUrl ? (
                <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2 p-4 text-center">
                  <Film className="w-6 h-6 text-danger-500/70" />
                  <span className="font-medium text-dark-300">Unable to load video preview</span>
                  <span className="text-[10px] text-dark-500">File could not be decrypted or loaded</span>
                </div>
              ) : (
                <video
                  src={fileUrl}
                  controls
                  className="w-full max-h-72 object-cover rounded-xl transition-transform duration-200"
                />
              )}
            </div>
            {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
          </div>
        );
      }

      // Generic file card for non-image/non-video files (PDF, DOC, XLS, PPT, archives, etc.)
      const fileInfo = getFileInfoFromMime(mimeType, firstLine);
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            className="group relative max-w-sm rounded-xl overflow-hidden bg-dark-800 border border-dark-600/50 transition-all shadow-md"
          >
            {isMediaLoading ? (
              <div className="w-64 h-24 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                <span>Decrypting E2EE File...</span>
              </div>
            ) : mediaError || !fileUrl ? (
              <div className="w-64 h-24 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2 p-4 text-center">
                <fileInfo.icon className="w-6 h-6 text-danger-500/70" />
                <span className="font-medium text-dark-300">Unable to decrypt file</span>
                <span className="text-[10px] text-dark-500">File could not be decrypted or loaded</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-dark-700 flex items-center justify-center">
                  <fileInfo.icon className="w-6 h-6 text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {fileInfo.name}
                  </p>
                  <p className="text-xs text-dark-400">
                    {fileInfo.sizeLabel} · End-to-end encrypted
                  </p>
                </div>
                <a
                  href={fileUrl}
                  download={fileInfo.name}
                  onClick={(e) => e.stopPropagation()}
                  title="Download file"
                  className="p-2 rounded-xl text-dark-300 hover:text-white hover:bg-dark-700 transition-all shrink-0"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
          {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
        </div>
      );
    }

    // GIF message type
    if (
      msg.messageType === 'GIF' ||
      (msg.messageType === 'TEXT' && (firstLine.includes('giphy.com') || firstLine.endsWith('.gif')))
    ) {
      const gifSrc = mediaBlobUrl || firstLine;
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            onClick={() => gifSrc && setLightboxSrc(gifSrc)}
            className="group relative max-w-sm rounded-xl overflow-hidden cursor-pointer bg-dark-800 border border-dark-600/50 hover:border-accent-500/50 transition-all shadow-md"
          >
            {gifError || !gifSrc ? (
              <div className="w-64 h-36 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2 p-4 text-center">
                <Film className="w-6 h-6 text-dark-500" />
                <span className="font-medium text-dark-300">GIF unavailable</span>
              </div>
            ) : (
              <>
                <img
                  src={gifSrc}
                  alt="GIF"
                  className="w-full max-h-72 object-contain rounded-xl group-hover:scale-[1.01] transition-transform duration-200"
                  loading="lazy"
                  onError={() => setGifError(true)}
                />
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-white font-bold tracking-wider">
                  GIF
                </div>
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
                  Click to enlarge 🔍
                </div>
              </>
            )}
          </div>
          {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
        </div>
      );
    }

    // Standard decrypted text
    return <span className="whitespace-pre-wrap">{decryptedText}</span>;
  };

  return (
    <div
      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
        msg.deleted
          ? 'bg-dark-700 text-dark-400 italic'
          : isOwn
          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-br-md'
          : 'bg-dark-700 text-dark-100 rounded-bl-md'
      }`}
    >
      {renderBody()}

      <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {encrypted && (
          <span
            title="End-to-End Encrypted (AES-GCM 256)"
            className={`inline-flex items-center text-[10px] ${
              isOwn ? 'text-white/60' : 'text-emerald-400'
            }`}
          >
            <Lock className="w-2.5 h-2.5 mr-0.5 inline" />
          </span>
        )}
        <span className={`text-[10px] ${isOwn ? 'text-white/50' : 'text-dark-400'}`}>
          {formatTime(msg.createdAt)}
        </span>
        {msg.edited && (
          <span className={`text-[10px] ${isOwn ? 'text-white/40' : 'text-dark-500'}`}>
            edited
          </span>
        )}
      </div>
    </div>
  );
}

export function ChatView({ conversationId, conversations }: Props) {
  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // SECURITY FIX (§8): state for the Security Code modal (fingerprint display).
  const [showSecurityCode, setShowSecurityCode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  // SECURITY FIX (§8): key-change warning state from the global store.
  const hasKeyWarning    = useKeyVerificationStore((s) => s.hasWarning);
  const addKeyWarning    = useKeyVerificationStore((s) => s.addWarning);

  const conversation = conversations.find((c) => c.id === conversationId);

  const conversationName =
    conversation?.type === 'DIRECT'
      ? conversation.members.find((m) => m.userId !== user?.id)?.name || 'Chat'
      : conversation?.name || 'Group';

  const peerMember = conversation?.members.find((m) => m.userId !== user?.id);
  const peerPublicKey = peerMember?.publicKey || '';

  // Load own public key to ensure it is always available for self-wrapping and self-decryption
  const [ownPublicKey, setOwnPublicKey] = useState<string>('');
  useEffect(() => {
    if (user?.id) {
      exportPublicKey(user.id).then((k) => setOwnPublicKey(k)).catch(() => {});
    }
  }, [user?.id]);

  // Dynamically fetch peer's public key if missing from conversation member record
  useEffect(() => {
    if (!peerMember || peerPublicKey) return;
    let isMounted = true;
    const fetchPeerKey = () => {
      userApi.getPublicKey(peerMember.userId).then((res) => {
        if (isMounted && res?.publicKey) {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      }).catch(() => {});
    };
    fetchPeerKey();
    const interval = setInterval(fetchPeerKey, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [peerMember?.userId, peerPublicKey, queryClient]);

  // SECURITY FIX (§8): TOFU key pinning check.
  // Whenever the peer's public key changes (or we see it for the first time),
  // compare it against our IndexedDB pin.  On 'changed', push a warning into the
  // keyVerificationStore so the UI blocks further sends until the user acknowledges.
  useEffect(() => {
    if (!peerMember || !peerPublicKey) return;
    let cancelled = false;
    checkAndPinPeerKey(peerMember.userId, peerPublicKey).then((result) => {
      if (cancelled) return;
      if (result.status === 'changed') {
        addKeyWarning({
          userId: peerMember.userId,
          userName: peerMember.name ?? conversationName,
          oldKeyBase64: result.pinned.publicKeyBase64,
          newKeyBase64: result.newKey,
          detectedAt: Date.now(),
        });
      }
    });
    return () => { cancelled = true; };
  }, [peerMember?.userId, peerPublicKey, conversationName, addKeyWarning]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) => messageApi.list(conversationId, pageParam as number | undefined),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as number | undefined,
    // POLLING FIX: Reduced from 2500ms (2.5s) to 15000ms (15s) to reduce server load.
    // In production, consider using WebSockets/SSE for real-time updates instead of polling.
    refetchInterval: 15000,
  });

  const allMessages = useMemo(
    () => data?.pages.flatMap((p) => p.messages).reverse() ?? [],
    [data]
  );

  const sendMutation = useMutation({
    mutationFn: (req: SendMessageRequest) =>
      messageApi.send(conversationId, {
        ...req,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setTimeout(() => scrollToBottom(), 100);
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!isLoading && allMessages.length > 0) {
      scrollToBottom();
    }
  }, [conversationId, isLoading, allMessages.length, scrollToBottom]);

  // Mark conversation as read whenever conversationId changes or new messages arrive while viewing
  useEffect(() => {
    if (!conversationId) return;
    conversationApi.markAsRead(conversationId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => {});
  }, [conversationId, allMessages.length, queryClient]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);

    if (el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ARCH FIX (§9): Build a recipients array from all conversation members INCLUDING self.
  // Including the sender ensures a wrapped key is created for the sender so they can
  // decrypt their own messages when loaded from the server / on page refresh.
  const encryptionRecipients = useMemo(() => {
    if (!conversation || !user) return [];
    const recipientsMap = new Map<string, string>();

    // 1. Add all members that currently have a public key in the conversation
    for (const m of conversation.members) {
      if (m.publicKey) {
        recipientsMap.set(m.userId, m.publicKey);
      }
    }

    // 2. Ensure own public key is included for sender decryption
    const myKey = conversation.members.find((m) => m.userId === user.id)?.publicKey || ownPublicKey;
    if (myKey) {
      recipientsMap.set(user.id, myKey);
    }

    return Array.from(recipientsMap.entries()).map(([userId, publicKeyBase64]) => ({
      userId,
      publicKeyBase64,
    }));
  }, [conversation, user, ownPublicKey]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;

    // SECURITY FIX (§8): Block sending if there is an unacknowledged key-change warning
    // for the peer.  This prevents silently encrypting to an unverified new key.
    if (peerMember && hasKeyWarning(peerMember.userId)) {
      return;
    }

    // Ensure peer public key is present in recipients for direct chats
    let recipients = [...encryptionRecipients];
    if (peerMember && !recipients.some((r) => r.userId === peerMember.userId)) {
      try {
        const peerKeyRes = await userApi.getPublicKey(peerMember.userId);
        if (peerKeyRes?.publicKey) {
          recipients.push({ userId: peerMember.userId, publicKeyBase64: peerKeyRes.publicKey });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      } catch { /* ignore */ }
    }

    // Direct chat safety: never send if recipient has no public key yet
    if (conversation?.type === 'DIRECT' && peerMember && !recipients.some((r) => r.userId === peerMember.userId)) {
      alert(`Waiting for ${conversationName} to log in and set up end-to-end encryption keys.`);
      return;
    }

    setInput('');
    setShowEmojiPicker(false);
    setShowGifPicker(false);

    // ARCH FIX (§9): Use fan-out group encryption for all conversations.
    // Includes all members (peer + self).
    const { encryptedContent, recipientKeys } = await encryptMessageForGroup(
      trimmed,
      conversationId,
      recipients,
      user?.id
    );

    sendMutation.mutate({
      content: encryptedContent,
      messageType: 'TEXT',
      recipientKeys,
    });
  };

  const handleSelectEmoji = (emoji: string) => {
    if (inputRef.current) {
      const start = inputRef.current.selectionStart ?? input.length;
      const end = inputRef.current.selectionEnd ?? input.length;
      const nextText = input.substring(0, start) + emoji + input.substring(end);
      setInput(nextText);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setInput((prev) => prev + emoji);
    }
  };

  const handleSelectGif = async (gifUrl: string) => {
    setShowGifPicker(false);

    let recipients = [...encryptionRecipients];
    if (peerMember && !recipients.some((r) => r.userId === peerMember.userId)) {
      try {
        const peerKeyRes = await userApi.getPublicKey(peerMember.userId);
        if (peerKeyRes?.publicKey) {
          recipients.push({ userId: peerMember.userId, publicKeyBase64: peerKeyRes.publicKey });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      } catch { /* ignore */ }
    }

    if (conversation?.type === 'DIRECT' && peerMember && !recipients.some((r) => r.userId === peerMember.userId)) {
      alert(`Waiting for ${conversationName} to log in and set up end-to-end encryption keys.`);
      return;
    }

    // ARCH FIX (§9): Use fan-out group encryption for GIFs too.
    const { encryptedContent, recipientKeys } = await encryptMessageForGroup(
      gifUrl,
      conversationId,
      recipients,
      user?.id
    );
    sendMutation.mutate({
      content: encryptedContent,
      messageType: 'GIF',
      recipientKeys,
    });
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const messagesByDate = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let lastDate = '';
    for (const msg of allMessages) {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        groups.push({ date: msg.createdAt, messages: [msg] });
        lastDate = msgDate;
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }
    return groups;
  }, [allMessages]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Chat Header with E2EE Badge */}
      <div className="px-5 py-3 border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {conversationName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span>{conversationName}</span>
            </h2>
            <p className="text-xs text-dark-300">
              {conversation?.type === 'GROUP'
                ? `${conversation.members.length} members`
                : 'Direct message'}
            </p>
          </div>
        </div>

        {/* SECURITY FIX (§8): E2EE badge is now a button that opens the Security Code modal.
            Users can compare fingerprints out-of-band to verify no key substitution occurred. */}
        <button
          onClick={() => setShowSecurityCode(true)}
          title="View Security Code — compare fingerprints to verify your conversation"
          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>End-to-End Encrypted</span>
        </button>
      </div>

      {/* SECURITY FIX (§8): Key-change warning banner — blocks chat interaction until
          the user explicitly acknowledges the new key.  Non-dismissible by design. */}
      {peerMember && (
        <KeyChangeWarningBanner
          userId={peerMember.userId}
          userName={peerMember.name ?? conversationName}
        />
      )}

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-1 custom-scrollbar"
      >
        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-dark-400" />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dark-400 text-sm flex-col gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-500/60" />
            <span>Messages in this chat are end-to-end encrypted.</span>
          </div>
        ) : (
          messagesByDate.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-dark-600" />
                <span className="text-xs text-dark-400 font-medium px-2">
                  {formatDateSeparator(group.date)}
                </span>
                <div className="flex-1 h-px bg-dark-600" />
              </div>

              {group.messages.map((msg, idx) => {
                const isOwn = msg.senderId === user?.id;
                const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
                const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;

                // For incoming messages in direct chat, sender is peer; for own messages, recipient is peer
                const itemPeerKey = isOwn
                  ? peerPublicKey
                  : conversation?.members.find((m) => m.userId === msg.senderId)?.publicKey || peerPublicKey;

                // Message sender's public key (needed to unwrap recipientKeys)
                const senderMember = conversation?.members.find((m) => m.userId === msg.senderId);
                const senderPublicKey = isOwn
                  ? (senderMember?.publicKey || ownPublicKey)
                  : (senderMember?.publicKey || peerPublicKey);

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${isOwn ? 'justify-end' : 'justify-start'} ${
                      showAvatar ? 'mt-3' : 'mt-0.5'
                    }`}
                  >
                    {!isOwn && (
                      <div className="w-8 shrink-0">
                        {showAvatar && (
                          <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center text-xs font-semibold text-dark-200">
                            {msg.senderName?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      {showAvatar && !isOwn && (
                        <p className="text-xs text-dark-300 mb-1 ml-1 font-medium">{msg.senderName}</p>
                      )}
                      
                      <DecryptedMessageItem
                        msg={msg}
                        conversationId={conversationId}
                        senderPublicKey={senderPublicKey}
                        peerPublicKey={itemPeerKey}
                        peerUserId={peerMember?.userId}
                        isOwn={isOwn}
                        formatTime={formatTime}
                        setLightboxSrc={setLightboxSrc}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest messages"
          className="absolute bottom-24 right-8 w-10 h-10 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center text-dark-300 hover:text-white hover:bg-dark-600 transition-all shadow-lg z-20"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelectEmoji={handleSelectEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* GIF Picker Popover */}
      {showGifPicker && (
        <GifPicker
          onSelectGif={handleSelectGif}
          onClose={() => setShowGifPicker(false)}
        />
      )}

      {/* Media Upload Modal (Images, Videos, Documents, Other Files) */}
      {showMediaModal && (
        <MediaUploadModal
          conversationId={conversationId}
          peerUserId={peerMember?.userId}
          peerPublicKey={peerPublicKey}
          encryptionRecipients={encryptionRecipients}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            setTimeout(() => scrollToBottom(), 100);
          }}
          onClose={() => setShowMediaModal(false)}
        />
      )}

      {/* Lightbox Viewer */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* SECURITY FIX (§8): Security Code modal — fingerprint comparison. */}
      {showSecurityCode && peerPublicKey && (
        <SecurityCodeModal
          peerName={conversationName}
          peerPublicKeyBase64={peerPublicKey}
          onClose={() => setShowSecurityCode(false)}
        />
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSend}
        className="px-5 py-3 border-t border-dark-600 bg-dark-800/80 backdrop-blur-sm relative z-20"
      >
        <div className="flex items-center gap-2">
          {/* Attach Button — Opens Media Upload Modal (Images, Videos, Documents, Other) */}
          <button
            type="button"
            onClick={() => setShowMediaModal(true)}
            title="Attach Encrypted File"
            className="p-2 rounded-xl text-dark-300 hover:text-primary-400 hover:bg-dark-700 transition-all shrink-0"
          >
            <LinkIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowGifPicker((prev) => !prev);
              setShowEmojiPicker(false);
            }}
            title="Choose Encrypted GIF"
            className={`p-2 rounded-xl transition-all shrink-0 ${
              showGifPicker
                ? 'text-accent-400 bg-dark-700'
                : 'text-dark-300 hover:text-accent-400 hover:bg-dark-700'
            }`}
          >
            <Film className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              setShowGifPicker(false);
            }}
            title="Emoji Picker"
            className={`p-2 rounded-xl transition-all shrink-0 ${
              showEmojiPicker
                ? 'text-amber-400 bg-dark-700'
                : 'text-dark-300 hover:text-amber-400 hover:bg-dark-700'
            }`}
          >
            <Smile className="w-5 h-5" />
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // SECURITY FIX (§8): disabled when a key-change warning requires acknowledgement.
            disabled={!!(peerMember && hasKeyWarning(peerMember.userId))}
            placeholder={
              peerMember && hasKeyWarning(peerMember.userId)
                ? 'Verify the security key change above before sending…'
                : conversation?.type === 'DIRECT' && !peerPublicKey
                ? `Waiting for ${conversationName} to set up encryption keys...`
                : 'Send an encrypted message...'
            }
            className="flex-1 px-4 py-2.5 bg-dark-700 border border-dark-500 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={!input.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 text-white flex items-center justify-center hover:from-primary-600 hover:to-accent-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-primary-500/20 shrink-0"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
