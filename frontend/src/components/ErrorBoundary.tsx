import { Component, type ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center bg-dark-900 p-4">
            <div className="text-center max-w-md w-full">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-800 border border-dark-600 mb-4">
                <MessageSquare className="w-8 h-8 text-dark-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
              <p className="text-dark-300 text-sm mb-4">
                {this.state.error?.message || 'An unexpected error occurred. Please try refreshing or resetting your session.'}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-dark-700 text-white rounded-xl text-sm font-medium hover:bg-dark-600 border border-dark-600 transition-colors"
                >
                  Refresh page
                </button>
                <button
                  onClick={this.handleReset}
                  className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors shadow-md shadow-primary-500/20"
                >
                  Sign in again
                </button>
              </div>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
