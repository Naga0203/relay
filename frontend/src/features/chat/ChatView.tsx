import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messageApi } from './api';
import { useAuthStore } from '../../stores/authStore';
import type { Conversation, Message, SendMessageRequest } from '../../types';
import { Send, Loader2, ArrowDown, Smile, Image as ImageIcon, Film } from 'lucide-react';
import { EmojiPicker } from '../../components/EmojiPicker';
import { GifPicker } from '../../components/GifPicker';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { ImageLightbox } from '../../components/ImageLightbox';

interface Props {
  conversationId: string;
  conversations: Conversation[];
}

export function ChatView({ conversationId, conversations }: Props) {
  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const conversation = conversations.find((c) => c.id === conversationId);

  // Determine display name for conversation
  const conversationName = conversation?.type === 'DIRECT'
    ? conversation.members.find((m) => m.userId !== user?.id)?.name || 'Chat'
    : conversation?.name || 'Group';

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) =>
      messageApi.list(conversationId, pageParam as number | undefined),
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    setInput('');
    setShowEmojiPicker(false);
    setShowGifPicker(false);
    sendMutation.mutate({ content: trimmed, messageType: 'TEXT' });
  };

  const handleSelectEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleSelectGif = (gifUrl: string) => {
    setShowGifPicker(false);
    sendMutation.mutate({
      content: gifUrl,
      messageType: 'GIF',
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

  // Group messages by date
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

  const isImageUrl = (url: string) => {
    return (
      url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) != null ||
      url.includes('/api/v1/files/') ||
      url.includes('giphy.com/media')
    );
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.deleted) {
      return <span className="italic text-dark-400">Message deleted</span>;
    }

    const content = msg.content || '';
    const lines = content.split('\n');
    const firstLine = lines[0] || '';
    const restLines = lines.slice(1).join('\n');

    // Handle IMAGE message or direct image URL
    if (msg.messageType === 'IMAGE' || (msg.messageType === 'TEXT' && isImageUrl(firstLine) && !firstLine.includes('giphy.com'))) {
      const imageUrl = firstLine.trim();
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            onClick={() => setLightboxSrc(imageUrl)}
            className="group relative max-w-sm rounded-xl overflow-hidden cursor-pointer bg-dark-800 border border-dark-600/50 hover:border-primary-500/50 transition-all shadow-md"
          >
            <img
              src={imageUrl}
              alt="Attachment"
              className="w-full max-h-72 object-cover rounded-xl group-hover:scale-[1.01] transition-transform duration-200"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
              Click to enlarge 🔍
            </div>
          </div>
          {restLines && <p className="text-sm leading-relaxed px-0.5">{restLines}</p>}
        </div>
      );
    }

    // Handle GIF message
    if (msg.messageType === 'GIF' || (msg.messageType === 'TEXT' && (firstLine.includes('giphy.com') || firstLine.endsWith('.gif')))) {
      const gifUrl = firstLine.trim();
      return (
        <div className="space-y-1.5 my-0.5">
          <div
            onClick={() => setLightboxSrc(gifUrl)}
            className="group relative max-w-sm rounded-xl overflow-hidden cursor-pointer bg-dark-800 border border-dark-600/50 hover:border-accent-500/50 transition-all shadow-md"
          >
            <img
              src={gifUrl}
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

    // Standard Text
    return <span className="whitespace-pre-wrap">{content}</span>;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Chat Header */}
      <div className="px-5 py-3 border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
          {conversationName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{conversationName}</h2>
          <p className="text-xs text-dark-300">
            {conversation?.type === 'GROUP'
              ? `${conversation.members.length} members`
              : 'Direct message'}
          </p>
        </div>
      </div>

      {/* Messages */}
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
          <div className="flex items-center justify-center h-full text-dark-400 text-sm">
            No messages yet. Say hello! 👋
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
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.deleted
                            ? 'bg-dark-700 text-dark-400 italic'
                            : isOwn
                            ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-br-md'
                            : 'bg-dark-700 text-dark-100 rounded-bl-md'
                        }`}
                      >
                        {renderMessageContent(msg)}

                        <div
                          className={`flex items-center gap-1.5 mt-1 ${
                            isOwn ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <span
                            className={`text-[10px] ${
                              isOwn ? 'text-white/50' : 'text-dark-400'
                            }`}
                          >
                            {formatTime(msg.createdAt)}
                          </span>
                          {msg.edited && (
                            <span
                              className={`text-[10px] ${
                                isOwn ? 'text-white/40' : 'text-dark-500'
                              }`}
                            >
                              edited
                            </span>
                          )}
                        </div>
                      </div>
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
            title="Attach Image"
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
            title="Choose GIF"
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
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 bg-dark-700 border border-dark-500 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm"
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
