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

  search: (conversationId: string, query: string) => {
    const params = new URLSearchParams({ q: query });
    return api
      .get<Message[]>(`/conversations/${conversationId}/messages/search?${params}`)
      .then((r) => r.data);
  },

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<{ fileName: string; fileUrl: string; contentType: string; size: number }>('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};
