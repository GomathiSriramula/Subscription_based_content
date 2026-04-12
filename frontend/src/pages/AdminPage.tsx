import { FormEvent, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, ShieldAlert, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { EBook, SubscriptionPlan } from '../types';

interface AdminPageProps {
  onNavigate: (page: string) => void;
}

interface BookFormState {
  title: string;
  author: string;
  category: string;
  cover_url: string;
  pdf_url: string;
  description: string;
  is_free: boolean;
}

const initialForm: BookFormState = {
  title: '',
  author: '',
  category: '',
  cover_url: '',
  pdf_url: '',
  description: '',
  is_free: false,
};

const DEFAULT_CATEGORIES = [
  'Health',
  'Finance',
  'Education',
  'Technology',
  'Business',
  'Self Help',
  'Psychology',
  'Productivity',
  'Career',
  'Lifestyle',
];

export default function AdminPage({ onNavigate }: AdminPageProps) {
  const { user, session } = useAuth();
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const [books, setBooks] = useState<EBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [form, setForm] = useState<BookFormState>(initialForm);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  const isAdmin = user?.role === 'admin';
  const categoryOptions = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...books.map((book) => book.category).filter(Boolean),
      form.category,
    ].filter(Boolean))
  );

  const resetForm = () => {
    setForm(initialForm);
    setEditingBookId(null);
  };

  const loadBooks = async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    try {
      const payload = await apiRequest<{ data: EBook[] }>('/api/admin/books', {
        token: session.access_token,
      });
      setBooks(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to fetch books.');
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    if (!session?.access_token) return;

    try {
      const payload = await apiRequest<{ data: SubscriptionPlan[] }>('/api/admin/plans', {
        token: session.access_token,
      });
      setPlans(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to fetch plans.');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadBooks();
      loadPlans();
    } else {
      setLoading(false);
    }
  }, [isAdmin, session?.access_token]);

  const handlePlanFieldChange = (planId: string, field: 'amount' | 'duration_days', value: string) => {
    const numericValue = Number(value);
    setPlans((current) => current.map((plan) => (
      plan.id === planId
        ? { ...plan, [field]: Number.isFinite(numericValue) ? numericValue : 0 }
        : plan
    )));
  };

  const handleSavePlan = async (plan: SubscriptionPlan) => {
    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    setError('');
    setSuccess('');
    setSavingPlanId(plan.id);

    try {
      await apiRequest<{ data: SubscriptionPlan }>(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        token: session.access_token,
        body: {
          name: plan.name,
          amount: plan.amount,
          duration_days: plan.duration_days,
        },
      });

      setSuccess(`${plan.name} plan updated successfully.`);
      await loadPlans();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update plan.');
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleEdit = (book: EBook) => {
    setEditingBookId(book.id);
    setForm({
      title: book.title,
      author: book.author,
      category: book.category,
      cover_url: book.cover_url,
      pdf_url: book.pdf_url,
      description: book.description,
      is_free: Boolean(book.is_free),
    });

    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleQuickEditSelect = (bookId: string) => {
    if (!bookId) return;
    const selectedBook = books.find((book) => book.id === bookId);
    if (selectedBook) {
      handleEdit(selectedBook);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    setSaving(true);
    try {
      if (editingBookId) {
        await apiRequest<{ data: EBook }>(`/api/admin/books/${editingBookId}`, {
          method: 'PUT',
          token: session.access_token,
          body: form,
        });
        setSuccess('Book updated successfully.');
      } else {
        await apiRequest<{ data: EBook }>('/api/admin/books', {
          method: 'POST',
          token: session.access_token,
          body: form,
        });
        setSuccess('Book added successfully.');
      }

      resetForm();
      await loadBooks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save book.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bookId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this book? This action cannot be undone.');
    if (!confirmed) return;

    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    setError('');
    setSuccess('');
    setDeletingBookId(bookId);

    try {
      await apiRequest(`/api/admin/books/${bookId}`, {
        method: 'DELETE',
        token: session.access_token,
      });
      setSuccess('Book deleted successfully.');
      await loadBooks();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete book.');
    } finally {
      setDeletingBookId(null);
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
          <h1 className="text-3xl font-bold text-white mb-1">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm">Manage books with add, edit, and delete actions.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg mb-4">
            <CheckCircle size={16} className="shrink-0" />
            {success}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
          <div ref={formSectionRef} />
          <h2 className="text-white font-semibold mb-4">{editingBookId ? 'Edit Book' : 'Add New Book'}</h2>
          {editingBookId && (
            <div className="mb-4 flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
              <p className="text-amber-300 text-sm">Editing an existing book. Update the fields below and click Update Book.</p>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-amber-300 hover:text-amber-200"
              >
                Cancel Edit
              </button>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs text-slate-400 mb-1">Quick Edit Existing Book</label>
            <select
              value={editingBookId || ''}
              onChange={(e) => handleQuickEditSelect(e.target.value)}
              className="w-full md:w-1/2 bg-slate-800 border border-slate-600 text-white px-3 py-2.5 rounded-lg"
            >
              <option value="">Select a book to edit</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} - {book.author}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required placeholder="Title" className="bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg" />
            <input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} required placeholder="Author" className="bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg" />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              required
              className="bg-slate-800 border border-slate-600 text-white px-3 py-2.5 rounded-lg"
            >
              <option value="" disabled>Select Category</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <input value={form.cover_url} onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))} required placeholder="Cover URL" className="bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg" />
            <input value={form.pdf_url} onChange={(e) => setForm((f) => ({ ...f, pdf_url: e.target.value }))} required placeholder="PDF URL" className="bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg md:col-span-2" />
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required placeholder="Description" rows={3} className="bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg md:col-span-2" />

            <label className="inline-flex items-center gap-2 text-slate-300 text-sm md:col-span-2">
              <input type="checkbox" checked={form.is_free} onChange={(e) => setForm((f) => ({ ...f, is_free: e.target.checked }))} className="accent-amber-500" />
              Mark as free book
            </label>

            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-slate-900 font-semibold px-4 py-2.5 rounded-lg">
                <Plus size={16} />
                {editingBookId ? 'Update Book' : 'Add Book'}
              </button>
              {editingBookId && (
                <button type="button" onClick={resetForm} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-lg border border-slate-700">
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Subscription Access Plans</h2>
          <p className="text-slate-400 text-sm mb-5">Set cost and duration for how long users can access content.</p>
          <div className="space-y-4">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">Plan Name</label>
                    <input
                      value={plan.name}
                      readOnly
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg"
                    />
                  </div>
                  <div className="w-full md:w-44">
                    <label className="block text-xs text-slate-400 mb-1">Cost (paise)</label>
                    <input
                      type="number"
                      min={1}
                      value={plan.amount}
                      onChange={(e) => handlePlanFieldChange(plan.id, 'amount', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded-lg"
                    />
                  </div>
                  <div className="w-full md:w-44">
                    <label className="block text-xs text-slate-400 mb-1">Duration (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={plan.duration_days}
                      onChange={(e) => handlePlanFieldChange(plan.id, 'duration_days', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePlan(plan)}
                    disabled={savingPlanId === plan.id}
                    className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-900 font-semibold px-4 py-2 rounded-lg"
                  >
                    {savingPlanId === plan.id ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-white font-semibold">Books Table</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-800/60 border-b border-slate-700">
                <tr>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Title</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Author</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Category</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Access</th>
                  <th className="text-right text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-slate-500 text-sm px-5 py-6">Loading books...</td>
                  </tr>
                ) : books.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-slate-500 text-sm px-5 py-6">No books found.</td>
                  </tr>
                ) : (
                  books.map((book) => (
                    <tr key={book.id} className="border-b border-slate-800 last:border-0">
                      <td className="px-5 py-4 text-sm text-white font-medium">{book.title}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{book.author}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{book.category}</td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${book.is_free ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>
                          {book.is_free ? 'Free' : 'Premium'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(book)}
                            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-md"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(book.id)}
                            disabled={deletingBookId === book.id}
                            className="inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-md"
                          >
                            <Trash2 size={13} /> {deletingBookId === book.id ? 'Deleting...' : 'Delete'}
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
      </div>
    </div>
  );
}
