import { MessageSquare } from 'lucide-react';

export function EmptyChat() {
  return (
    <div className="flex-1 flex items-center justify-center bg-dark-900">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-dark-800 border border-dark-600 mb-6">
          <MessageSquare className="w-10 h-10 text-dark-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Your messages</h2>
        <p className="text-dark-300 max-w-sm">
          Select a conversation from the sidebar or start a new one to begin chatting.
        </p>
      </div>
    </div>
  );
}
