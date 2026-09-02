import { useQuery } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { conversationApi } from '../conversations/api';
import { ConversationList } from '../conversations/ConversationList';
import { ChatView } from './ChatView';
import { EmptyChat } from './EmptyChat';
import { LogOut, MessageSquare, Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../auth/api';

export function ChatLayout() {
  const { activeConversationId, sidebarOpen, toggleSidebar } = useChatStore();
  const { user, logout: localLogout } = useAuthStore();
  const navigate = useNavigate();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: conversationApi.list,
    refetchInterval: 10000,
  });

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch { /* continue */ }
    localLogout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex overflow-hidden bg-dark-900">
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
            className="lg:hidden text-dark-300 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            activeId={activeConversationId}
          />
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-dark-600">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-600 to-accent-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-dark-300 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="text-dark-400 hover:text-danger-500 transition-colors p-1.5 rounded-lg hover:bg-dark-700"
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
    </div>
  );
}
