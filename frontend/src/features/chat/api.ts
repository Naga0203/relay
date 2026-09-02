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

  search: (conversationId: string, query: string) =>
    api
      .get<Message[]>(`/conversations/${conversationId}/messages/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.data),
};
