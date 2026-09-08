import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messageApi } from './api';
import { useAuthStore } from '../../stores/authStore';
import type { Conversation, Message, SendMessageRequest } from '../../types';
import { Send, Loader2, ArrowDown, Smile, Image as ImageIcon, Film, ShieldCheck, Lock } from 'lucide-react';
import { EmojiPicker } from '../../components/EmojiPicker';
import { GifPicker } from '../../components/GifPicker';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { ImageLightbox } from '../../components/ImageLightbox';
import { SecurityCodeModal } from '../../components/SecurityCodeModal';
import { KeyChangeWarningBanner } from '../../components/KeyChangeWarningBanner';
import {
  decryptText,
  decryptFileToUrl,
  isEncrypted,
  checkAndPinPeerKey,
  encryptMessageForGroup,
  decryptGroupMessage,
} from '../../lib/e2eCrypto';
import { useKeyVerificationStore } from '../../stores/keyVerificationStore';

interface Props {
  conversationId: string;
  conversations: Conversation[];
}

interface DecryptedItemProps {
  msg: Message;
  conversationId: string;
  peerPublicKey: string;
  isOwn: boolean;
  formatTime: (iso: string) => string;
  setLightboxSrc: (src: string) => void;
}

/**
 * Sub-component for rendering single decrypted E2EE messages and attachments.
 */
function DecryptedMessageItem({ msg, conversationId, peerPublicKey, isOwn, formatTime, setLightboxSrc }: DecryptedItemProps) {
  const [decryptedText, setDecryptedText] = useState<string>('');
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<boolean>(false);

  const encrypted = isEncrypted(msg.content);

  // ARCH FIX (§9): Use group decryption when recipientKeys are present on the message.
  // Falls back to legacy pairwise decryptText for older messages without wrapped keys.
  useEffect(() => {
    let isMounted = true;
    async function performDecrypt() {
      if (!msg.content) {
        setDecryptedText('');
        return;
      }
      // Determine the current user's wrapped key (if available).
      const myWrappedKey = msg.recipientKeys?.[useAuthStore.getState().user?.id ?? ''] ?? null;
      let plain: string;
      if (myWrappedKey) {
        // §9 fan-out decryption path
        plain = await decryptGroupMessage(msg.content, conversationId, peerPublicKey, myWrappedKey);
      } else {
        // Legacy pairwise decryption path
        plain = await decryptText(msg.content, conversationId, peerPublicKey);
      }
      if (isMounted) {
        setDecryptedText(plain);
      }
    }
    performDecrypt();
    return () => {
      isMounted = false;
    };
  }, [msg.content, conversationId, peerPublicKey, msg.recipientKeys]);

  const lines = decryptedText.split('\n');
  const firstLine = lines[0] || '';
  const restLines = lines.slice(1).join('\n');

  const isImgUrl = (url: string) => {
    return (
      url.match(/\.(jpeg|jpg|gif|png|webp|enc)($|\?)/i) != null ||
      url.includes('/api/v1/files/') ||
      url.includes('giphy.com/media')
    );
  };

  // Handle encrypted file payload fetch & local decryption
  useEffect(() => {
    let isMounted = true;
    if (!firstLine || !firstLine.includes('/api/v1/files/')) return;

    if (firstLine.endsWith('.enc') || firstLine.includes('/api/v1/files/')) {
      setLoadingMedia(true);
      fetch(firstLine)
        .then((res) => res.arrayBuffer())
        .then(async (buffer) => {
          if (!isMounted) return;
          // ARCH FIX (§12b): Derive the real MIME type from the URL before it gained
          // the .enc suffix, rather than hardcoding 'image/png'.  For example
          // "photo.jpg.enc" → "image/jpeg".  Falls back to 'image/jpeg' for unknown
          // extensions since the vast majority of encrypted uploads are photos.
          const baseName = firstLine.replace(/\.enc$/i, '');
          const ext = baseName.split('.').pop()?.toLowerCase() ?? '';
          const mimeFromExt: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg',
            png: 'image/png', gif: 'image/gif', webp: 'image/webp',
          };
          const detectedMime = mimeFromExt[ext] ?? 'image/jpeg';
          const url = await decryptFileToUrl(buffer, conversationId, peerPublicKey, detectedMime);
          if (isMounted) {
            setMediaBlobUrl(url || firstLine);
          }
        })
        .catch(() => {
          if (isMounted) setMediaBlobUrl(firstLine);
        })
        .finally(() => {
          if (isMounted) setLoadingMedia(false);
        });
    } else {
      setMediaBlobUrl(firstLine);
    }

    return () => {
      isMounted = false;
    };
  }, [firstLine, conversationId, peerPublicKey]);

  const renderBody = () => {
    if (msg.deleted) {
      return <span className="italic text-dark-400">Message deleted</span>;
    }

    if (!decryptedText && msg.content) {
      return <Loader2 className="w-4 h-4 animate-spin text-dark-400" />;
    }

    // IMAGE message type or direct image link
    if (
      msg.messageType === 'IMAGE' ||
      (msg.messageType === 'TEXT' && isImgUrl(firstLine) && !firstLine.includes('giphy.com'))
    ) {
      const displaySrc = mediaBlobUrl || firstLine;
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            onClick={() => displaySrc && setLightboxSrc(displaySrc)}
            className="group relative max-w-sm rounded-xl overflow-hidden cursor-pointer bg-dark-800 border border-dark-600/50 hover:border-primary-500/50 transition-all shadow-md"
          >
            {loadingMedia ? (
              <div className="w-64 h-44 flex flex-col items-center justify-center bg-dark-800 text-xs text-dark-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                <span>Decrypting E2EE Media...</span>
              </div>
            ) : (
              <img
                src={displaySrc}
                alt="E2EE Attachment"
                className="w-full max-h-72 object-cover rounded-xl group-hover:scale-[1.01] transition-transform duration-200"
                loading="lazy"
              />
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
              Click to enlarge 🔍
            </div>
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
            <img
              src={gifSrc}
              alt="GIF"
              className="w-full max-h-72 object-contain rounded-xl group-hover:scale-[1.01] transition-transform duration-200"
              loading="lazy"
            />
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-white font-bold tracking-wider">
              GIF
            </div>
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
              Click to enlarge 🔍
            </div>
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
  const [showImageModal, setShowImageModal] = useState(false);
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
    refetchInterval: 4000,
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

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);

    if (el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ARCH FIX (§9): Build a recipients array from all conversation members except self.
  // Used for both text and GIF sends via encryptMessageForGroup.
  const encryptionRecipients = useMemo(() => {
    if (!conversation || !user) return [];
    return conversation.members
      .filter((m) => m.userId !== user.id && m.publicKey)
      .map((m) => ({ userId: m.userId, publicKeyBase64: m.publicKey! }));
  }, [conversation, user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;

    // SECURITY FIX (§8): Block sending if there is an unacknowledged key-change warning
    // for the peer.  This prevents silently encrypting to an unverified new key.
    if (peerMember && hasKeyWarning(peerMember.userId)) {
      return;
    }

    setInput('');
    setShowEmojiPicker(false);
    setShowGifPicker(false);

    // ARCH FIX (§9): Use fan-out group encryption for all conversations.
    // For DIRECT chats this collapses to a single recipient — no special-casing.
    const { encryptedContent, recipientKeys } = await encryptMessageForGroup(
      trimmed,
      conversationId,
      encryptionRecipients
    );

    sendMutation.mutate({
      content: encryptedContent,
      messageType: 'TEXT',
      recipientKeys,
    });
  };

  const handleSelectEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleSelectGif = async (gifUrl: string) => {
    setShowGifPicker(false);
    // ARCH FIX (§9): Use fan-out group encryption for GIFs too.
    const { encryptedContent, recipientKeys } = await encryptMessageForGroup(
      gifUrl,
      conversationId,
      encryptionRecipients
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
                        peerPublicKey={itemPeerKey}
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

      {/* Image Upload Modal */}
      {showImageModal && (
        <ImageUploadModal
          conversationId={conversationId}
          peerPublicKey={peerPublicKey}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            setTimeout(() => scrollToBottom(), 100);
          }}
          onClose={() => setShowImageModal(false)}
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
          {/* Action Buttons */}
          <button
            type="button"
            onClick={() => setShowImageModal(true)}
            title="Attach Encrypted Image"
            className="p-2 rounded-xl text-dark-300 hover:text-primary-400 hover:bg-dark-700 transition-all shrink-0"
          >
            <ImageIcon className="w-5 h-5" />
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
