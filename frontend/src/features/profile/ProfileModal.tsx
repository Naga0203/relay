import { useState, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { userApi } from './api';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Camera,
  User as UserIcon,
  AtSign,
  Mail,
  ShieldCheck,
  Calendar,
  Users as GenderIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface Props {
  onClose: () => void;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB limit

export function ProfileModal({ onClose }: Props) {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');

    // File type validation
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setError('Please select a valid image (JPEG, PNG, WebP, or GIF).');
      return;
    }

    // Size limit validation (2MB)
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Profile picture exceeds 2MB limit. Please choose a smaller image.');
      return;
    }

    setAvatarLoading(true);
    try {
      const updatedUser = await userApi.uploadAvatar(file);
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSuccess('Profile picture updated successfully!');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to upload profile picture.');
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }

    if (trimmedUsername && trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    setLoading(true);
    try {
      const updatedUser = await userApi.updateProfile({
        name: trimmedName,
        username: trimmedUsername || undefined,
      });

      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSuccess('Profile updated successfully!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-700 flex items-center justify-between bg-dark-850">
          <div className="flex items-center gap-2 text-white font-semibold">
            <UserIcon className="w-5 h-5 text-primary-400" />
            <span>Profile Management</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-danger-500/10 border border-danger-500/30 text-danger-400 px-4 py-3 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary-500/30 bg-dark-700 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="bg-gradient-to-br from-primary-500 to-accent-500 w-full h-full flex items-center justify-center">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarLoading}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1 cursor-pointer"
                title="Change profile picture"
              >
                {avatarLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
                ) : (
                  <>
                    <Camera className="w-6 h-6" />
                    <span>Change</span>
                  </>
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
            <div className="text-center">
              <p className="text-xs text-dark-400">Max size 2MB (JPEG, PNG, WebP, GIF)</p>
            </div>
          </div>

          {/* Editable Display Name */}
          <div>
            <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
              Display Name
            </label>
            <div className="relative flex items-center">
              <UserIcon className="w-4 h-4 absolute left-3 text-dark-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
                className="w-full pl-9 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                required
              />
            </div>
            <p className="text-[11px] text-dark-400 mt-1">This is how your name appears to other users in chats.</p>
          </div>

          {/* Unique Username */}
          <div>
            <label className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
              Unique Username
            </label>
            <div className="relative flex items-center">
              <AtSign className="w-4 h-4 absolute left-3 text-dark-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                placeholder="unique_username"
                className="w-full pl-9 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                required
              />
            </div>
            <p className="text-[11px] text-dark-400 mt-1">
              Your unique identity in Relay. Lowercase letters, numbers, underscores, and periods.
            </p>
          </div>

          {/* Metadata Row: Email & Badges */}
          <div className="p-3 bg-dark-700/50 border border-dark-600 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between text-dark-300">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-dark-400" />
                Email
              </span>
              <span className="text-white font-medium">{user?.email}</span>
            </div>

            <div className="flex items-center justify-between text-dark-300">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary-400" />
                Account Status
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  user?.accountType === 'MINOR'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                }`}
              >
                {user?.accountType === 'MINOR' ? 'Minor Account (<18)' : 'Major Account (18+)'}
              </span>
            </div>

            {(user?.age !== undefined || user?.gender) && (
              <div className="flex items-center justify-between text-dark-300 pt-1 border-t border-dark-600/50">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-dark-400" />
                  Age: {user?.age ?? 'N/A'}
                </span>
                <span className="flex items-center gap-1.5">
                  <GenderIcon className="w-3.5 h-3.5 text-dark-400" />
                  {user?.gender ?? 'N/A'}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || avatarLoading}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white font-medium text-sm transition-all shadow-md shadow-primary-500/20 flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
