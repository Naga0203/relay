import api from '../../lib/axios';
import type { Message, MessagePage, SendMessageRequest } from '../../types';

export const messageApi = {
  list: (conversationId: string, before?: number, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', String(before));
    return api
      .get<MessagePage>(`/conversations/${conversationId}/messages?${params}`)
      .then((r) => r.data);
  },

  send: (conversationId: string, data: SendMessageRequest) =>
    api
      .post<Message>(`/conversations/${conversationId}/messages`, data)
      .then((r) => r.data),

  edit: (messageId: string, content: string) =>
    api.patch<Message>(`/messages/${messageId}`, { content }).then((r) => r.data),

  delete: (messageId: string) => api.delete(`/messages/${messageId}`),

  // ARCH FIX (§7): search() removed — the server-side search endpoint has been
  // deleted because message content is AES-GCM ciphertext and LIKE matching on it
  // is meaningless (and a match would imply plaintext leaked to the server).
  // Implement search client-side by filtering the already-decrypted message list
  // that lives in the useInfiniteQuery cache in ChatView.

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<{ fileName: string; fileUrl: string; contentType: string; size: number }>(
        '/files/upload',
        formData,
        {
          headers: {
            'Content-Type': undefined,
          },
        }
      )
      .then((r) => r.data);
  },

  // SECURITY FIX (§12d): Download a file through the axios instance so the
  // response interceptor's token-refresh logic applies.
  // Normalize full backend URL (e.g., http://localhost:8080/api/v1/files/...) to
  // relative path (/files/...) so the request stays same-origin via the Vite proxy
  // and complies with Content-Security-Policy connect-src 'self'.
  downloadFile: (fileUrl: string) => {
    let requestPath = fileUrl;
    try {
      if (requestPath.startsWith('http://') || requestPath.startsWith('https://')) {
        requestPath = new URL(requestPath).pathname;
      }
    } catch {
      // Keep requestPath as-is if URL parsing fails
    }

    // Strip leading /api/v1 since api baseURL is already configured with /api/v1
    if (requestPath.startsWith('/api/v1/')) {
      requestPath = requestPath.replace('/api/v1', '');
    }

    return api
      .get<ArrayBuffer>(requestPath, { responseType: 'arraybuffer' })
      .then((r) => r.data);
  },
};
