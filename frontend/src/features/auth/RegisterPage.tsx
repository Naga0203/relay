import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { authApi } from './api';
import { useAuthStore } from '../../stores/authStore';
import {
  MessageSquare,
  Loader2,
  Eye,
  EyeOff,
  User as UserIcon,
  AtSign,
  Mail,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState('Prefer not to say');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  // Live Age Validation & Classification
  const parsedAge = parseInt(age, 10);
  const isAgeValid = !isNaN(parsedAge) && parsedAge >= 1 && parsedAge <= 125;
  const isMinor = isAgeValid && parsedAge < 18;

  // Live Password Match Validation
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  // Live Username Validation
  const isUsernameValid = /^[a-zA-Z0-9_.]{3,30}$/.test(username);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (name.trim().length < 2) {
      setError('Please enter a valid name (at least 2 characters).');
      return;
    }

    if (!isUsernameValid) {
      setError('Username must be 3-30 characters and contain only letters, numbers, underscores, and periods.');
      return;
    }

    if (!isAgeValid) {
      setError('Please enter a valid age between 1 and 125.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.register({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        age: parsedAge,
        gender,
        password,
        confirmPassword,
      });

      login(res.accessToken, res.refreshToken, res.user);
      navigate('/');
    } catch (err: unknown) {
      let message = 'Registration failed. Please try again.';
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.message) {
          message = err.response.data.message;
        } else if (err.response?.data?.errors) {
          message = Object.values(err.response.data.errors as Record<string, string>).join('. ');
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 mb-3 shadow-lg shadow-primary-500/25">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Create Account</h1>
          <p className="text-dark-300 mt-1 text-sm">Join Relay for secure end-to-end encrypted chats</p>
        </div>

        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-danger-500/10 border border-danger-500/30 text-danger-400 px-4 py-3 rounded-xl text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="reg-name" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative flex items-center">
                <UserIcon className="w-4 h-4 absolute left-3.5 text-dark-400" />
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  className="w-full pl-10 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm"
                  placeholder="Alice Johnson"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label htmlFor="reg-username" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative flex items-center">
                <AtSign className="w-4 h-4 absolute left-3.5 text-dark-400" />
                <input
                  id="reg-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                  required
                  minLength={3}
                  maxLength={30}
                  className="w-full pl-10 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm"
                  placeholder="alice"
                />
              </div>
              {username.length > 0 && !isUsernameValid && (
                <p className="text-[11px] text-amber-400 mt-1">
                  Must be 3-30 letters, numbers, underscores, or periods.
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 absolute left-3.5 text-dark-400" />
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm"
                  placeholder="alice@example.com"
                />
              </div>
            </div>

            {/* Age & Gender Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Age */}
              <div>
                <label htmlFor="reg-age" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Age
                </label>
                <div className="relative flex items-center">
                  <Calendar className="w-4 h-4 absolute left-3.5 text-dark-400" />
                  <input
                    id="reg-age"
                    type="number"
                    min={1}
                    max={125}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm"
                    placeholder="25"
                  />
                </div>
                {/* Age Classification Pill */}
                {age !== '' && (
                  <div className="mt-1">
                    {isAgeValid ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isMinor
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        {isMinor ? 'Minor Account (<18)' : 'Major Account (18+)'}
                      </span>
                    ) : (
                      <span className="text-[11px] text-danger-400">Please enter a valid age (1-125)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Gender */}
              <div>
                <label htmlFor="reg-gender" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                  Gender
                </label>
                <select
                  id="reg-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm cursor-pointer"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm pr-11"
                  placeholder="Min 8 chars, uppercase, lowercase, digit, symbol"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-dark-400 hover:text-dark-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="reg-confirm-password" className="block text-xs font-semibold text-dark-300 uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className={`w-full px-4 py-2.5 bg-dark-700 border rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 transition-all text-sm pr-11 ${
                    passwordMismatch
                      ? 'border-danger-500 focus:ring-danger-500'
                      : passwordsMatch
                      ? 'border-emerald-500 focus:ring-emerald-500'
                      : 'border-dark-600 focus:ring-primary-500'
                  }`}
                  placeholder="Re-enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 text-dark-400 hover:text-dark-200 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordMismatch && (
                <p className="text-[11px] text-danger-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Passwords do not match
                </p>
              )}
              {passwordsMatch && (
                <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || passwordMismatch}
              className="w-full py-3 px-4 mt-2 bg-gradient-to-r from-primary-500 to-accent-500 text-white rounded-xl font-semibold hover:from-primary-600 hover:to-accent-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Account
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-dark-300 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
