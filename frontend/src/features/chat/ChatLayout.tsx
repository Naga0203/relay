import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { conversationApi } from '../conversations/api';
import { ConversationList } from '../conversations/ConversationList';
import { ChatView } from './ChatView';
import { EmptyChat } from './EmptyChat';
import { ProfileModal } from '../profile/ProfileModal';
import { LogOut, MessageSquare, Menu, X, Settings, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../auth/api';
import {
  handleIncomingMessageNotification,
  requestNotificationPermission,
} from '../../lib/notification';
import type { Conversation } from '../../types';

export function ChatLayout() {
  const { activeConversationId, setActiveConversation, sidebarOpen, toggleSidebar } = useChatStore();
  const { user, logout: localLogout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showProfile, setShowProfile] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    conversationId: string;
    senderName: string;
    message: string;
  } | null>(null);

  // Request browser notification permission once on layout mount
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: conversationApi.list,
    refetchInterval: 3000,
  });

  // Track unread counts per conversation to trigger notifications
  const prevUnreadRef = useRef<Record<string, number>>({});
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (isLoading || conversations.length === 0) return;

    // Skip notification on initial page load
    if (initialLoadRef.current) {
      for (const conv of conversations) {
        prevUnreadRef.current[conv.id] = conv.unreadCount ?? 0;
      }
      initialLoadRef.current = false;
      return;
    }

    // Check for increased unread counts
    for (const conv of conversations) {
      const prev = prevUnreadRef.current[conv.id] ?? 0;
      const current = conv.unreadCount ?? 0;

      if (current > prev) {
        // Find sender display name
        let senderName = 'Someone';
        if (conv.type === 'DIRECT') {
          const other = conv.members.find((m) => m.userId !== user?.id);
          senderName = other?.name || 'Contact';
        } else {
          senderName = conv.name || 'Group Chat';
        }

        handleIncomingMessageNotification({
          messageId: `${conv.id}-${current}-${Date.now()}`,
          senderName,
          senderId: 'other-user',
          currentUserId: user?.id,
          conversationId: conv.id,
          activeConversationId,
          onNavigate: (id) => setActiveConversation(id),
        });
      }

      prevUnreadRef.current[conv.id] = current;
    }
  }, [conversations, isLoading, activeConversationId, user?.id, setActiveConversation]);

  // Listen for in-app notification events
  useEffect(() => {
    function handleInAppNotification(e: Event) {
      const customEvent = e as CustomEvent<{
        conversationId: string;
        senderName: string;
        message: string;
      }>;
      if (customEvent.detail) {
        setToastNotification(customEvent.detail);
      }
    }

    window.addEventListener('relay-in-app-notification', handleInAppNotification);
    return () => window.removeEventListener('relay-in-app-notification', handleInAppNotification);
  }, []);

  // Auto-dismiss toast notification after 4 seconds
  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => {
      setToastNotification(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* continue */
    }
    // Clean all caches and stores
    queryClient.clear();
    prevUnreadRef.current = {};
    localLogout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex overflow-hidden bg-dark-900 relative">
      {/* In-App Notification Toast */}
      {toastNotification && (
        <div
          onClick={() => {
            setActiveConversation(toastNotification.conversationId);
            setToastNotification(null);
          }}
          className="fixed top-4 right-4 z-50 bg-dark-800/95 border border-primary-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md max-w-sm flex items-start gap-3 cursor-pointer hover:border-primary-500 transition-all animate-in slide-in-from-top-4 duration-200"
        >
          <div className="w-9 h-9 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{toastNotification.senderName}</p>
            <p className="text-xs text-dark-300 mt-0.5">{toastNotification.message}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setToastNotification(null);
            }}
            className="text-dark-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 w-80 bg-dark-800 border-r border-dark-600 flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-md shadow-primary-500/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">Relay</h1>
          </div>
          <button
            onClick={toggleSidebar}
            aria-label="Close sidebar"
            className="lg:hidden text-dark-300 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            activeId={activeConversationId}
          />
        </div>

        {/* User Footer (Interactive Profile Entry) */}
        <div className="p-3 border-t border-dark-600 bg-dark-850">
          <div className="flex items-center gap-3 px-2">
            <div
              onClick={() => setShowProfile(true)}
              className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-primary-600 to-accent-500 flex items-center justify-center text-white font-semibold text-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-primary-500/50 transition-all"
              title="View & edit profile"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0).toUpperCase()
              )}
            </div>

            <div
              onClick={() => setShowProfile(true)}
              className="flex-1 min-w-0 cursor-pointer group"
              title="Click to edit profile"
            >
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-white group-hover:text-primary-300 transition-colors truncate">
                  {user?.name}
                </p>
                <Settings className="w-3 h-3 text-dark-400 group-hover:text-primary-400 transition-colors opacity-0 group-hover:opacity-100" />
              </div>
              <p className="text-xs text-dark-400 truncate">
                {user?.username ? `@${user.username}` : user?.email}
              </p>
            </div>

            <button
              onClick={handleLogout}
              aria-label="Logout"
              title="Logout"
              className="text-dark-400 hover:text-danger-400 transition-colors p-2 rounded-lg hover:bg-dark-700"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm"
          onClick={toggleSidebar}
        />
      )}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 p-3 border-b border-dark-600 bg-dark-800">
          <button
            onClick={toggleSidebar}
            aria-label="Open sidebar"
            className="text-dark-300 hover:text-white transition-colors p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-white">Relay</span>
        </div>

        {activeConversationId ? (
          <ChatView
            conversationId={activeConversationId}
            conversations={conversations}
          />
        ) : (
          <EmptyChat />
        )}
      </main>

      {/* Profile Management Modal */}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
