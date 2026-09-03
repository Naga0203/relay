import api from '../../lib/axios';
import type {
  Conversation,
  CreateConversationRequest,
} from '../../types';

export const conversationApi = {
  list: () =>
    api.get<Conversation[]>('/conversations').then((r) => r.data),

  get: (id: string) =>
    api.get<Conversation>(`/conversations/${id}`).then((r) => r.data),

  create: (data: CreateConversationRequest) =>
    api.post<Conversation>('/conversations', data).then((r) => r.data),

  addMember: (conversationId: string, memberId: string) =>
    api.post<Conversation>(`/conversations/${conversationId}/members`, { memberId })
      .then((r) => r.data),

  removeMember: (conversationId: string, userId: string) =>
    api.delete(`/conversations/${conversationId}/members/${userId}`),
};
