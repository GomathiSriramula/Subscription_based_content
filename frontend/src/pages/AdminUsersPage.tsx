import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Search, Users, Crown, Clock, UserCircle, Ban, ShieldCheck, CalendarDays, RotateCcw, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { AdminUser, SubscriptionPlan } from '../types';

interface AdminUsersPageProps {
  onNavigate: (page: string) => void;
}

function getStatusClasses(status: AdminUser['subscription_status']) {
  if (status === 'active') {
    return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  }
  if (status === 'pending') {
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  }
  if (status === 'expired') {
    return 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
  }
  return 'bg-slate-700 text-slate-300 border border-slate-600';
}

function formatDate(date: string | null) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPlanLabel(user: AdminUser) {
  if (user.subscription_plan) {
    return user.subscription_plan;
  }

  if (user.subscription_status === 'active' || user.subscription_status === 'pending') {
    return 'Unknown';
  }

  return 'N/A';
}

function normalizeAdminUser(raw: Partial<AdminUser> & Record<string, unknown>): AdminUser {
  const statusValue = String(raw.subscription_status || raw.subscriptionStatus || 'none').toLowerCase();
  const normalizedStatus: AdminUser['subscription_status'] =
    statusValue === 'active' || statusValue === 'pending' || statusValue === 'expired'
      ? statusValue
      : 'none';

  return {
    id: String(raw.id || ''),
    email: String(raw.email || ''),
    fullName: String(raw.fullName || raw.full_name || ''),
    role: raw.role === 'admin' ? 'admin' : 'user',
    createdAt: String(raw.createdAt || raw.created_at || ''),
    is_blocked: Boolean(raw.is_blocked || raw.isBlocked),
    blocked_at: (raw.blocked_at as string) || (raw.blockedAt as string) || null,
    subscription_status: normalizedStatus,
    subscription_plan: (raw.subscription_plan as string) || (raw.subscriptionPlan as string) || null,
    subscription_expiry_date:
      (raw.subscription_expiry_date as string) || (raw.subscriptionExpiryDate as string) || null,
  };
}

export default function AdminUsersPage({ onNavigate }: AdminUsersPageProps) {
  const { user, session } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
  const [subscriptionUser, setSubscriptionUser] = useState<AdminUser | null>(null);
  const [subscriptionAction, setSubscriptionAction] = useState<'activate' | 'extend'>('activate');
  const [subscriptionPlanId, setSubscriptionPlanId] = useState('');
  const [subscriptionExpiryDate, setSubscriptionExpiryDate] = useState('');
  const [subscriptionExtendDays, setSubscriptionExtendDays] = useState('');
  const [savingSubscription, setSavingSubscription] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const loadUsers = async () => {
      if (!session?.access_token || !isAdmin) {
        setLoading(false);
        return;
      }

      try {
        const payload = await apiRequest<{ data: Array<Partial<AdminUser> & Record<string, unknown>> }>('/api/admin/users', {
          token: session.access_token,
        });
        setUsers(payload.data.map(normalizeAdminUser));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to fetch users.');
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, [session?.access_token, isAdmin]);

  useEffect(() => {
    const loadPlans = async () => {
      if (!session?.access_token || !isAdmin) {
        setLoadingPlans(false);
        return;
      }

      try {
        const payload = await apiRequest<{ data: SubscriptionPlan[] }>('/api/admin/plans', {
          token: session.access_token,
        });
        setPlans(payload.data);
        if (payload.data.length > 0) {
          setSubscriptionPlanId(payload.data[0].id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to fetch plans.');
      } finally {
        setLoadingPlans(false);
      }
    };

    loadPlans();
  }, [session?.access_token, isAdmin]);

  const openSubscriptionModal = (targetUser: AdminUser) => {
    const preferredPlanId = plans.find((plan) => plan.id === targetUser.subscription_plan)?.id || plans[0]?.id || '';
    setSubscriptionUser(targetUser);
    setSubscriptionAction(targetUser.subscription_status === 'active' ? 'extend' : 'activate');
    setSubscriptionPlanId(preferredPlanId);
    setSubscriptionExpiryDate(targetUser.subscription_expiry_date ? targetUser.subscription_expiry_date.slice(0, 10) : '');
    setSubscriptionExtendDays('30');
    setError('');
    setSuccess('');
  };

  const closeSubscriptionModal = () => {
    setSubscriptionUser(null);
    setSubscriptionAction('activate');
    setSubscriptionExpiryDate('');
    setSubscriptionExtendDays('30');
    setSavingSubscription(false);
  };

  const handleSubscriptionSubmit = async () => {
    if (!session?.access_token || !subscriptionUser) {
      setError('Please sign in again to continue.');
      return;
    }

    if (!subscriptionPlanId) {
      setError('Select a plan first.');
      return;
    }

    setSavingSubscription(true);
    setError('');
    setSuccess('');

    try {
      await apiRequest(`/api/admin/users/${subscriptionUser.id}/subscription`, {
        method: 'POST',
        token: session.access_token,
        body: {
          action: subscriptionAction,
          planId: subscriptionPlanId,
          expiryDate: subscriptionExpiryDate || undefined,
          extendDays: subscriptionExtendDays ? Number(subscriptionExtendDays) : undefined,
        },
      });

      setSuccess(
        subscriptionAction === 'extend'
          ? `${subscriptionUser.fullName}'s subscription has been extended.`
          : `${subscriptionUser.fullName}'s subscription has been activated.`
      );
      closeSubscriptionModal();
      setLoading(true);
      const payload = await apiRequest<{ data: Array<Partial<AdminUser> & Record<string, unknown>> }>('/api/admin/users', {
        token: session.access_token,
      });
      setUsers(payload.data.map(normalizeAdminUser));
    } catch (subscriptionError) {
      setError(subscriptionError instanceof Error ? subscriptionError.message : 'Failed to update subscription.');
    } finally {
      setSavingSubscription(false);
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((entry) => {
      const roleText = entry.role.toLowerCase();
      const statusText = entry.subscription_status.toLowerCase();
      const planText = (entry.subscription_plan || '').toLowerCase();
      const blockText = entry.is_blocked ? 'blocked' : 'active';
      return (
        entry.fullName.toLowerCase().includes(query) ||
        entry.email.toLowerCase().includes(query) ||
        roleText.includes(query) ||
        statusText.includes(query) ||
        planText.includes(query) ||
        blockText.includes(query)
      );
    });
  }, [users, search]);

  const activeCount = users.filter((entry) => entry.subscription_status === 'active').length;

  const handleRoleToggle = async (targetUser: AdminUser) => {
    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    if (targetUser.id === user?.id) {
      setError('You cannot change your own role.');
      return;
    }

    setError('');
    setSuccess('');
    setUpdatingUserId(targetUser.id);

    try {
      const isAdminTarget = targetUser.role === 'admin';
      const endpoint = isAdminTarget
        ? `/api/admin/users/${targetUser.id}/demote`
        : `/api/admin/users/${targetUser.id}/promote`;

      await apiRequest<{ user: { id: string; role: 'user' | 'admin' } }>(endpoint, {
        method: 'POST',
        token: session.access_token,
      });

      setUsers((current) =>
        current.map((entry) =>
          entry.id === targetUser.id
            ? { ...entry, role: isAdminTarget ? 'user' : 'admin' }
            : entry
        )
      );

      setSuccess(
        isAdminTarget
          ? `${targetUser.fullName} has been changed to user.`
          : `${targetUser.fullName} has been promoted to admin.`
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update user role.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleBlockToggle = async (targetUser: AdminUser) => {
    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    if (targetUser.id === user?.id) {
      setError('You cannot block your own account.');
      return;
    }

    setError('');
    setSuccess('');
    setBlockingUserId(targetUser.id);

    try {
      const endpoint = targetUser.is_blocked
        ? `/api/admin/users/${targetUser.id}/unblock`
        : `/api/admin/users/${targetUser.id}/block`;

      await apiRequest(endpoint, {
        method: 'POST',
        token: session.access_token,
      });

      setUsers((current) =>
        current.map((entry) =>
          entry.id === targetUser.id
            ? {
                ...entry,
                is_blocked: !targetUser.is_blocked,
                blocked_at: targetUser.is_blocked ? null : new Date().toISOString(),
              }
            : entry
        )
      );

      setSuccess(
        targetUser.is_blocked
          ? `${targetUser.fullName} has been unblocked.`
          : `${targetUser.fullName} has been blocked.`
      );
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : 'Failed to update user block status.');
    } finally {
      setBlockingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 flex items-start gap-3">
            <ShieldAlert size={20} className="text-red-400 mt-0.5" />
            <div>
              <h1 className="text-white font-semibold mb-1">Admin access required</h1>
              <p className="text-slate-400 text-sm mb-4">You do not have permission to access this page.</p>
              <button
                onClick={() => onNavigate('dashboard')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm border border-slate-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">User Management</h1>
          <p className="text-slate-400 text-sm">View users, search quickly, and track role plus subscription status.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Users</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white">{loading ? '...' : users.length}</p>
              <Users size={18} className="text-sky-400" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Admins</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white">{loading ? '...' : users.filter((entry) => entry.role === 'admin').length}</p>
              <UserCircle size={18} className="text-violet-400" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Active Subscribers</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white">{loading ? '...' : activeCount}</p>
              <Crown size={18} className="text-amber-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <div className="relative max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, role, plan, or status"
                className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-800/70 border-b border-slate-700">
                <tr>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Role</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Account</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Subscription</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Plan</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Expiry</th>
                  <th className="text-right text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-slate-500 text-sm px-5 py-6">Loading users...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-slate-500 text-sm px-5 py-6">No users found for this search.</td>
                  </tr>
                ) : (
                  filteredUsers.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-800 last:border-0">
                      <td className="px-5 py-4 text-sm text-white font-medium">{entry.fullName}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{entry.email}</td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.role === 'admin' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-slate-700 text-slate-300 border border-slate-600'}`}>
                          {entry.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.is_blocked ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                          {entry.is_blocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusClasses(entry.subscription_status)}`}>
                          {entry.subscription_status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300 capitalize">{getPlanLabel(entry)}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={13} className="text-slate-500" />
                          {formatDate(entry.subscription_expiry_date)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleRoleToggle(entry)}
                            disabled={updatingUserId === entry.id || blockingUserId === entry.id || entry.id === user?.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
                              entry.role === 'admin'
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300 disabled:opacity-50'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300 disabled:opacity-50'
                            }`}
                            title={entry.id === user?.id ? 'You cannot change your own role' : undefined}
                          >
                            {updatingUserId === entry.id
                              ? 'Updating...'
                              : entry.role === 'admin'
                              ? 'Set as User'
                              : 'Set as Admin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBlockToggle(entry)}
                            disabled={blockingUserId === entry.id || updatingUserId === entry.id || entry.id === user?.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
                              entry.is_blocked
                                ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300 disabled:opacity-50'
                                : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300 disabled:opacity-50'
                            }`}
                            title={entry.id === user?.id ? 'You cannot block your own role' : undefined}
                          >
                            {blockingUserId === entry.id ? (
                              'Updating...'
                            ) : entry.is_blocked ? (
                              <>
                                <ShieldCheck size={13} /> Unblock
                              </>
                            ) : (
                              <>
                                <Ban size={13} /> Block
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openSubscriptionModal(entry)}
                            disabled={loadingPlans || entry.id === user?.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300 disabled:opacity-50"
                            title={entry.id === user?.id ? 'You cannot change your own subscription' : undefined}
                          >
                            <CalendarDays size={13} />
                            {entry.subscription_status === 'active' ? 'Extend' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {subscriptionUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={16} className="text-amber-400" />
                    <h2 className="text-white font-semibold">Manage Subscription</h2>
                  </div>
                  <p className="text-slate-400 text-sm">Update expiry date, activate, or extend the selected user.</p>
                </div>
                <button type="button" onClick={closeSubscriptionModal} className="text-slate-400 hover:text-white">
                  <ShieldCheck size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Selected User</p>
                  <p className="text-white font-medium">{subscriptionUser.fullName}</p>
                  <p className="text-slate-400 text-sm">{subscriptionUser.email}</p>
                  <p className="text-slate-500 text-xs mt-2">
                    Current status: {subscriptionUser.subscription_status} | Expires: {formatDate(subscriptionUser.subscription_expiry_date)}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs text-slate-400 mb-1">Action</span>
                    <select
                      value={subscriptionAction}
                      onChange={(event) => setSubscriptionAction(event.target.value as 'activate' | 'extend')}
                      className="w-full bg-slate-800 border border-slate-600 text-white px-3 py-2.5 rounded-lg"
                    >
                      <option value="activate">Activate</option>
                      <option value="extend">Extend</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-xs text-slate-400 mb-1">Plan</span>
                    <select
                      value={subscriptionPlanId}
                      onChange={(event) => setSubscriptionPlanId(event.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white px-3 py-2.5 rounded-lg"
                      disabled={loadingPlans}
                    >
                      {plans.length === 0 ? (
                        <option value="">No plans available</option>
                      ) : (
                        plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} - ₹{(plan.amount / 100).toFixed(2)} / {plan.duration_days} days
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-xs text-slate-400 mb-1">Expiry Date</span>
                    <input
                      type="date"
                      value={subscriptionExpiryDate}
                      onChange={(event) => setSubscriptionExpiryDate(event.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white px-3 py-2.5 rounded-lg"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs text-slate-400 mb-1">Extend Days</span>
                    <input
                      type="number"
                      min={1}
                      value={subscriptionExtendDays}
                      onChange={(event) => setSubscriptionExtendDays(event.target.value)}
                      placeholder="30"
                      className="w-full bg-slate-800 border border-slate-600 text-white px-3 py-2.5 rounded-lg"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeSubscriptionModal}
                    className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubscriptionSubmit}
                    disabled={savingSubscription || loadingPlans || !subscriptionPlanId}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-slate-900 font-semibold"
                  >
                    <CalendarDays size={15} />
                    {savingSubscription ? 'Saving...' : subscriptionAction === 'extend' ? 'Extend Subscription' : 'Activate Subscription'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
