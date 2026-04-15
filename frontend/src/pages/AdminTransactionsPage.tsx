import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Search, IndianRupee, CalendarDays, User, BadgeDollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { PaymentTransaction } from '../types';

interface AdminTransactionsPageProps {
  onNavigate: (page: string) => void;
}

function formatDate(date: string | null) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amountInr: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amountInr);
}

export default function AdminTransactionsPage({ onNavigate }: AdminTransactionsPageProps) {
  const { user, session } = useAuth();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const loadTransactions = async () => {
      if (!session?.access_token || !isAdmin) {
        setLoading(false);
        return;
      }

      try {
        const payload = await apiRequest<{ data: PaymentTransaction[] }>('/api/admin/transactions', {
          token: session.access_token,
        });
        setTransactions(payload.data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to fetch transactions.');
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [session?.access_token, isAdmin]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return transactions;

    return transactions.filter((transaction) => {
      return (
        transaction.user_name.toLowerCase().includes(query) ||
        transaction.user_email.toLowerCase().includes(query) ||
        transaction.plan_name.toLowerCase().includes(query) ||
        String(transaction.amount_inr).includes(query) ||
        formatDate(transaction.payment_date).toLowerCase().includes(query)
      );
    });
  }, [transactions, search]);

  const totalRevenue = useMemo(
    () => transactions.reduce((sum, transaction) => sum + transaction.amount_inr, 0),
    [transactions]
  );

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
    return transactions.reduce((sum, transaction) => {
      const parsed = new Date(transaction.payment_date || '');
      if (Number.isNaN(parsed.getTime())) {
        return sum;
      }

      const key = `${parsed.getFullYear()}-${parsed.getMonth()}`;
      return key === currentKey ? sum + transaction.amount_inr : sum;
    }, 0);
  }, [transactions]);

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
          <h1 className="text-3xl font-bold text-white mb-1">Payment Transactions</h1>
          <p className="text-slate-400 text-sm">Completed payments with user, plan, amount, and payment date.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Completed Payments</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white">{loading ? '...' : transactions.length}</p>
              <BadgeDollarSign size={18} className="text-emerald-400" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Monthly Revenue</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white">{loading ? '...' : formatCurrency(monthlyRevenue)}</p>
              <IndianRupee size={18} className="text-violet-400" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Revenue</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-white">{loading ? '...' : formatCurrency(totalRevenue)}</p>
              <IndianRupee size={18} className="text-violet-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-4">
            <div className="relative max-w-md flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by user, plan, amount, or date"
                className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-800/70 border-b border-slate-700">
                <tr>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">User</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Plan</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Amount</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-slate-500 text-sm px-5 py-6">Loading transactions...</td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-slate-500 text-sm px-5 py-6">No completed payments found.</td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-slate-800 last:border-0">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                            <User size={14} className="text-slate-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{transaction.user_name}</div>
                            <div className="text-xs text-slate-500">{transaction.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">{transaction.plan_name}</td>
                      <td className="px-5 py-4 text-sm text-white font-medium">{formatCurrency(transaction.amount_inr)}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={13} className="text-slate-500" />
                          {formatDate(transaction.payment_date)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500 font-mono">{transaction.razorpay_payment_id || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}