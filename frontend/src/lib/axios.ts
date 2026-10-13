import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Request interceptor — attach access token and preserve multipart boundary for FormData
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // When payload is FormData, do NOT send application/json; let the browser/axios set multipart/form-data with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    delete config.headers['content-type'];
    if (typeof (config.headers as any).delete === 'function') {
      (config.headers as any).delete('Content-Type');
      (config.headers as any).delete('content-type');
    }
  }
  return config;
});

// Token refresh lock to prevent race conditions
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve(token!);
  });
  failedQueue = [];
};

// Response interceptor — handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });

          // ARCH FIX (§12c): Route token updates through the Zustand store action
          // instead of writing to localStorage directly.  This keeps in-memory state
          // and persisted state in sync — any component observing the store will see
          // the latest token state rather than stale values from before the refresh.
          useAuthStore.getState().updateTokens(data.accessToken, data.refreshToken);

          processQueue(null, data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        } catch (err) {
          processQueue(err, null);
          // On refresh failure, perform a full logout through the store so all state
          // (in-memory + localStorage) is cleared atomically.
          useAuthStore.getState().logout();
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      } else {
        useAuthStore.getState().logout();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      isRefreshing = false;
    }

    return Promise.reject(error);
  }
);

export default api;
