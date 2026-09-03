import api from '../../lib/axios';
import type { User } from '../../types';

export const userApi = {
  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),

  updateProfile: (data: { name?: string; avatarUrl?: string; status?: string }) =>
    api.patch<User>('/users/me', data).then((r) => r.data),

  search: (q: string, signal?: AbortSignal) =>
    api.get<User[]>(`/users/search?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.data),
};
