import api from '../../lib/axios';
import type { User, UpdateProfileRequest, PublicKeyResponse } from '../../types';

export const userApi = {
  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),

  updateProfile: (data: UpdateProfileRequest) =>
    api.patch<User>('/users/me', data).then((r) => r.data),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    // FIX: Do NOT set Content-Type explicitly — axios auto-detects
    // multipart/form-data and writes the correct boundary.
    return api.post<User>('/users/me/avatar', formData)
      .then((r) => r.data);
  },

  search: (q: string, signal?: AbortSignal) =>
    api.get<User[]>(`/users/search?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.data),

  uploadPublicKey: (publicKey: string) =>
    api.put('/users/me/public-key', { publicKey }),

  getPublicKey: (userId: string) =>
    api.get<PublicKeyResponse>(`/users/${userId}/public-key`).then((r) => r.data),
};
