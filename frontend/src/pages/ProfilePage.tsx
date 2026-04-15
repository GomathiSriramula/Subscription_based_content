import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Eye, EyeOff, Mail, PencilLine, Shield, User, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ProfilePageProps {
  onNavigate: (page: string) => void;
}

function formatDate(date: string | null) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user, subscription, isSubscribed, updateProfile, changePassword } = useAuth();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setFullName(user?.user_metadata?.full_name || '');
    setEmail(user?.email || '');
  }, [user?.user_metadata?.full_name, user?.email]);

  const displayFullName = user?.user_metadata?.full_name || 'Reader';
  const displayEmail = user?.email || 'N/A';
  const subscriptionStatus = subscription?.status || 'inactive';
  const daysLeft = subscription?.expiry_date
    ? Math.max(0, Math.ceil((new Date(subscription.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const getStatusLabel = () => {
    if (!subscription) return 'Inactive';
    if (subscriptionStatus === 'pending') return 'Pending';
    if (subscriptionStatus === 'expired' || daysLeft <= 0) return 'Expired';
    return 'Active';
  };

  const getStatusClasses = () => {
    const status = getStatusLabel();
    if (status === 'Active') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (status === 'Pending') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (status === 'Expired') return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getPlanLabel = () => {
    if (!subscription?.plan) return 'No plan';
    if (subscription.plan === 'monthly') return 'Monthly';
    if (subscription.plan === 'yearly') return 'Yearly';
    return subscription.plan
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSuccess('');
    setError('');

    const result = await updateProfile(fullName, email);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Profile updated successfully.');
    }

    setSaving(false);
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChangingPassword(true);
    setSuccess('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      setChangingPassword(false);
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }

    setChangingPassword(false);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <button
          onClick={() => onNavigate('dashboard')}
          className="inline-flex items-center gap-2 text-slate-300 hover:text-white mb-6"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500/20 via-slate-900 to-slate-900 px-6 py-8 border-b border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <User size={30} className="text-amber-400" />
              </div>
              <div>
                <p className="text-slate-400 text-sm uppercase tracking-wide mb-1">User Profile</p>
                <h1 className="text-3xl font-bold text-white leading-tight">{displayFullName}</h1>
                <p className="text-slate-300 mt-1 flex items-center gap-2">
                  <Mail size={15} className="text-slate-500" />
                  {displayEmail}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {(success || error) && (
              <div className={`mb-6 flex items-center gap-2.5 text-sm px-4 py-3 rounded-lg border ${success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {success ? <CheckCircle size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                {success || error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Name</p>
                  <p className="text-white font-medium">{displayFullName}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Email</p>
                  <p className="text-white font-medium break-all">{displayEmail}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Role</p>
                <p className="text-white font-medium capitalize flex items-center gap-2">
                  <Shield size={15} className="text-slate-400" />
                  {user?.role || 'user'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <PencilLine size={16} className="text-amber-400" />
                <h2 className="text-white font-semibold">Edit Profile</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs uppercase tracking-wide text-slate-500 mb-2">Full Name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="Your name"
                    required
                  />
                </label>

                <label className="block">
                  <span className="block text-xs uppercase tracking-wide text-slate-500 mb-2">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="you@example.com"
                    required
                  />
                </label>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFullName(user?.user_metadata?.full_name || '');
                    setEmail(user?.email || '');
                    setSuccess('');
                    setError('');
                  }}
                  className="bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-lg transition-colors"
                >
                  Reset
                </button>
              </div>
            </form>

            <form onSubmit={handlePasswordSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <PencilLine size={16} className="text-amber-400" />
                <h2 className="text-white font-semibold">Change Password</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block">
                  <span className="block text-xs uppercase tracking-wide text-slate-500 mb-2">Current Password</span>
                  <div className="relative">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 pr-11 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      placeholder="Current password"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="block text-xs uppercase tracking-wide text-slate-500 mb-2">New Password</span>
                  <div className="relative">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 pr-11 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      placeholder="New password"
                      required
                      minLength={6}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="block text-xs uppercase tracking-wide text-slate-500 mb-2">Confirm Password</span>
                  <div className="relative">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 pr-11 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      placeholder="Confirm new password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((current) => !current)}
                      aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowPasswords((current) => !current)}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPasswords ? 'Hide passwords' : 'Show passwords'}
                </button>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  {changingPassword ? 'Updating...' : 'Change Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setSuccess('');
                    setError('');
                  }}
                  className="bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-lg transition-colors"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Subscription Details</h2>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getStatusClasses()}`}>
                    {getStatusLabel()}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Plan</span>
                    <span className="text-slate-100 font-medium">{getPlanLabel()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Expiry Date</span>
                    <span className="text-slate-100 font-medium">{formatDate(subscription?.expiry_date ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Clock size={14} />
                      Days Left
                    </span>
                    <span className={`font-medium ${isSubscribed ? 'text-emerald-300' : 'text-slate-400'}`}>
                      {daysLeft}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Started</span>
                    <span className="text-slate-100 font-medium">{formatDate(subscription?.start_date ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Amount</span>
                    <span className="text-slate-100 font-medium">
                      {subscription?.amount ? `₹${Math.round(subscription.amount / 100).toLocaleString('en-IN')}` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h2 className="text-white font-semibold mb-3">Quick Actions</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => onNavigate('books')}
                    className="w-full text-left bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-3 transition-colors"
                  >
                    <p className="text-white font-medium">Open Library</p>
                    <p className="text-slate-500 text-xs mt-1">Browse all books and continue reading.</p>
                  </button>
                  <button
                    onClick={() => onNavigate('subscription')}
                    className="w-full text-left bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-3 transition-colors"
                  >
                    <p className="text-white font-medium">Manage Subscription</p>
                    <p className="text-slate-500 text-xs mt-1">View plans or renew your access.</p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
