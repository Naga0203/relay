import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { conversationApi } from './api';
import { userApi } from '../profile/api';
import type { Conversation, User } from '../../types';
import { Plus, Search, Users, MessageCircle, Loader2, X } from 'lucide-react';

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
  const setActive = useChatStore((s) => s.setActiveConversation);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

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
    },
  });

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await userApi.search(q);
      setSearchResults(results.filter((u) => u.id !== currentUser?.id));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const getConversationDisplay = (conv: Conversation) => {
    if (conv.type === 'DIRECT') {
      const other = conv.members.find((m) => m.userId !== currentUser?.id);
      return { name: other?.name || 'Unknown', initial: other?.name?.charAt(0) || '?' };
    }
    return { name: conv.name || 'Group', initial: conv.name?.charAt(0) || 'G' };
  };

  const handleSelect = (id: string) => {
    setActive(id);
    setSidebarOpen(false); // Close sidebar on mobile
  };

  return (
    <div className="flex flex-col">
      {/* Action bar */}
      <div className="p-3 flex items-center gap-2">
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white text-sm transition-all border border-dark-600"
        >
          {showNew ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showNew ? 'Cancel' : 'New conversation'}
        </button>
      </div>

      {/* New conversation search */}
      {showNew && (
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search users by name or email..."
              className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-500 rounded-xl text-sm text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              autoFocus
            />
          </div>

          {searching && (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-dark-400" />
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => createMutation.mutate(u.id)}
                  disabled={createMutation.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-600 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-dark-500 flex items-center justify-center text-sm font-semibold text-dark-200 shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{u.name}</p>
                    <p className="text-xs text-dark-400 truncate">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {search.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-xs text-dark-400 text-center py-3">No users found</p>
          )}
        </div>
      )}

      {/* Conversations */}
      <div className="space-y-0.5 px-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-dark-400 text-sm">No conversations yet</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const { name, initial } = getConversationDisplay(conv);
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
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white'
                      : 'bg-dark-600 text-dark-200'
                  }`}
                >
                  {initial.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-sm font-medium truncate ${
                        isActive ? 'text-white' : 'text-dark-100'
                      }`}
                    >
                      {name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {conv.type === 'GROUP' ? (
                      <Users className="w-3 h-3 text-dark-400" />
                    ) : (
                      <MessageCircle className="w-3 h-3 text-dark-400" />
                    )}
                    <span className="text-xs text-dark-400">
                      {conv.type === 'GROUP'
                        ? `${conv.members.length} members`
                        : 'Direct'}
                    </span>
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
