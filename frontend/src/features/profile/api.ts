import api from '../../lib/axios';
import type { User, PublicKeyResponse } from '../../types';

export const userApi = {
  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),

  updateProfile: (data: { name?: string; avatarUrl?: string; status?: string }) =>
    api.patch<User>('/users/me', data).then((r) => r.data),

  search: (q: string, signal?: AbortSignal) =>
    api.get<User[]>(`/users/search?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.data),

  uploadPublicKey: (publicKey: string) =>
    api.put('/users/me/public-key', { publicKey }),

  getPublicKey: (userId: string) =>
    api.get<PublicKeyResponse>(`/users/${userId}/public-key`).then((r) => r.data),
};
