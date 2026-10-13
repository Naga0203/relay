import { useState, useRef, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { conversationApi } from './api';
import { userApi } from '../profile/api';
import type { Conversation, User } from '../../types';
import { Plus, Search, Users, MessageCircle, Loader2, X, MessageSquarePlus, AtSign, Mail } from 'lucide-react';

interface Props {
  conversations: Conversation[];
  isLoading: boolean;
  activeId: string | null;
}

export function ConversationList({ conversations, isLoading, activeId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [createError, setCreateError] = useState('');
  const setActive = useChatStore((s) => s.setActiveConversation);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const createMutation = useMutation({
    mutationFn: (memberId: string) =>
      conversationApi.create({ type: 'DIRECT', memberIds: [memberId] }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActive(conv.id);
      setShowNew(false);
      setSearch('');
      setSearchResults([]);
      setSidebarOpen(false);
      setCreateError('');
    },
    onError: () => {
      setCreateError('Failed to create conversation. Please try again.');
    },
  });

  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = async (q: string) => {
    setSearch(q);
    const cleanQ = q.trim().replace(/^@/, '');
    if (cleanQ.length < 2) {
      setSearchResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    try {
      const results = await userApi.search(cleanQ, controller.signal);
      if (!controller.signal.aborted) {
        setSearchResults(results.filter((u) => u.id !== currentUser?.id));
      }
    } catch {
      if (!controller.signal.aborted) {
        setSearchResults([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  };

  const getConversationDisplay = (conv: Conversation) => {
    if (conv.type === 'DIRECT') {
      const other = conv.members.find((m) => m.userId !== currentUser?.id);
      return {
        name: other?.name || 'Unknown',
        username: other?.username,
        email: other?.email,
        initial: other?.name?.charAt(0) || '?',
        avatarUrl: other?.avatarUrl,
        otherUserId: other?.userId,
      };
    }
    return {
      name: conv.name || 'Group',
      username: undefined,
      email: undefined,
      initial: conv.name?.charAt(0) || 'G',
      avatarUrl: conv.avatarUrl,
      otherUserId: undefined,
    };
  };

  const handleSelect = (id: string) => {
    setActive(id);
    setSidebarOpen(false); // Close sidebar on mobile
    conversationApi.markAsRead(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }).catch(() => {});
  };

  const cleanQuery = search.trim().toLowerCase().replace(/^@/, '');

  // Filter existing conversations by name, username, or email
  const filteredConversations = useMemo(() => {
    if (!cleanQuery) return conversations;
    return conversations.filter((conv) => {
      if (conv.type === 'GROUP') {
        return conv.name?.toLowerCase().includes(cleanQuery);
      }
      const other = conv.members.find((m) => m.userId !== currentUser?.id);
      const nameMatch = other?.name?.toLowerCase().includes(cleanQuery);
      const usernameMatch = other?.username?.toLowerCase().includes(cleanQuery);
      const emailMatch = other?.email?.toLowerCase().includes(cleanQuery);
      return Boolean(nameMatch || usernameMatch || emailMatch);
    });
  }, [conversations, cleanQuery, currentUser?.id]);

  const handleUserClick = (u: User) => {
    // Check if direct conversation already exists with this user
    const existing = conversations.find(
      (c) => c.type === 'DIRECT' && c.members.some((m) => m.userId === u.id)
    );
    if (existing) {
      handleSelect(existing.id);
      setSearch('');
      setSearchResults([]);
      setShowNew(false);
    } else {
      createMutation.mutate(u.id);
    }
  };

  const toggleNewConversation = () => {
    const nextState = !showNew;
    setShowNew(nextState);
    if (nextState) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearch('');
      setSearchResults([]);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Action bar */}
      <div className="p-3 flex items-center justify-between gap-2 border-b border-dark-700/60">
        <span className="text-xs font-bold uppercase tracking-wider text-dark-400 px-1">Messages</span>
        <button
          onClick={toggleNewConversation}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            showNew
              ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
              : 'bg-dark-700 hover:bg-dark-600 text-dark-200 hover:text-white border border-dark-600'
          }`}
          title="Start new conversation"
        >
          {showNew ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-primary-400" />}
          <span>{showNew ? 'Close' : 'New chat'}</span>
        </button>
      </div>

      {/* Global & Conversation Search Bar */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search name, @username, or email..."
            className="w-full pl-9 pr-8 py-2 bg-dark-700/80 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500/80 transition-all shadow-inner"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setSearchResults([]);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white p-0.5 rounded-md hover:bg-dark-600 transition-all"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Hints when 'New chat' is clicked */}
        {showNew && !search && (
          <div className="mt-2.5 p-2.5 bg-dark-700/40 border border-dark-600/60 rounded-xl text-xs text-dark-300 flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-primary-400 shrink-0" />
            <span>Type a name, <strong className="text-white">@username</strong>, or <strong className="text-white">email</strong> to find anyone on Relay.</span>
          </div>
        )}

        {/* Search spinner */}
        {searching && (
          <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-dark-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400" />
            <span>Searching users by name, username & email...</span>
          </div>
        )}

        {/* Error notification */}
        {createError && (
          <div className="bg-danger-500/10 border border-danger-500/30 text-danger-500 px-3 py-2 rounded-xl text-xs mt-2">
            {createError}
          </div>
        )}
      </div>

      {/* When searching: Server Global User Results */}
      {searchResults.length > 0 && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary-400 flex items-center gap-1">
              <AtSign className="w-3 h-3" /> People Found ({searchResults.length})
            </span>
          </div>
          <div className="space-y-1 bg-dark-800/60 p-1 rounded-xl border border-dark-600/50 max-h-56 overflow-y-auto">
            {searchResults.map((u) => {
              const existingConv = conversations.find(
                (c) => c.type === 'DIRECT' && c.members.some((m) => m.userId === u.id)
              );
              return (
                <button
                  key={u.id}
                  onClick={() => handleUserClick(u)}
                  disabled={createMutation.isPending}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-dark-700/80 active:bg-dark-600 transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-full bg-dark-600 border border-dark-500 flex items-center justify-center text-xs font-semibold text-white shrink-0 overflow-hidden">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      u.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-xs font-semibold text-white truncate">{u.name}</span>
                      {u.username && (
                        <span className="text-[11px] font-mono text-primary-400 shrink-0 font-medium">
                          @{u.username}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-dark-400 truncate">
                      <Mail className="w-2.5 h-2.5 text-dark-500 shrink-0" />
                      <span className="truncate">{u.email}</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-medium shrink-0 bg-primary-500/15 text-primary-300 border border-primary-500/30 group-hover:bg-primary-500 group-hover:text-white transition-all">
                    {existingConv ? 'Chat' : 'Message'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No matching results banner */}
      {search.length >= 2 && !searching && searchResults.length === 0 && filteredConversations.length === 0 && (
        <div className="text-center py-6 px-4">
          <p className="text-dark-300 text-xs font-medium">No users or conversations found</p>
          <p className="text-dark-400 text-[11px] mt-1">Try searching by full email, @username, or name</p>
        </div>
      )}

      {/* Conversations Section */}
      <div className="space-y-0.5 px-2 pb-6">
        {cleanQuery && filteredConversations.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-dark-400">
            Conversations ({filteredConversations.length})
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
          </div>
        ) : filteredConversations.length === 0 && !cleanQuery ? (
          <div className="text-center py-8">
            <p className="text-dark-400 text-sm">No conversations yet</p>
            <p className="text-dark-500 text-xs mt-1">Search for a user by name, @username or email to start</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const { name, username, email, initial, avatarUrl } = getConversationDisplay(conv);
            const isActive = conv.id === activeId;
            return (
              <button
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  isActive
                    ? 'bg-primary-500/15 border border-primary-500/20'
                    : 'hover:bg-dark-700 border border-transparent'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden ${
                    isActive
                      ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white'
                      : 'bg-dark-600 text-dark-200'
                  }`}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    initial.toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-sm font-medium truncate ${
                          isActive ? 'text-white' : 'text-dark-100'
                        }`}
                      >
                        {name}
                      </span>
                      {username && (
                        <span className="text-xs text-primary-400/90 shrink-0 font-mono">
                          @{username}
                        </span>
                      )}
                    </div>
                    {conv.unreadCount && conv.unreadCount > 0 ? (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-primary-500 text-white shadow-sm shadow-primary-500/40 animate-pulse shrink-0">
                        {conv.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <div className="flex items-center gap-1 truncate text-xs text-dark-400">
                      {conv.type === 'GROUP' ? (
                        <>
                          <Users className="w-3 h-3 text-dark-400 shrink-0" />
                          <span className="truncate">{conv.members.length} members</span>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-3 h-3 text-dark-400 shrink-0" />
                          <span className="truncate">{email || 'Direct'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
