import { FormEvent, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, ShieldAlert, CheckCircle, AlertCircle, Users, BookOpen, Crown, IndianRupee, BarChart3, TrendingUp, Search, SlidersHorizontal, RotateCcw, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, getApiBaseUrl } from '../lib/api';
import { AdminAnalytics, Category, EBook, SubscriptionPlan } from '../types';

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
  featured: boolean;
}

interface PlanFormState {
  name: string;
  amount: string;
  duration_days: string;
}

const initialForm: BookFormState = {
  title: '',
  author: '',
  category: '',
  cover_url: '',
  pdf_url: '',
  description: '',
  is_free: false,
  featured: false,
};

const initialPlanForm: PlanFormState = {
  name: '',
  amount: '',
  duration_days: '',
};

type AssetSource = 'url' | 'upload';
type BookAccessFilter = 'all' | 'free' | 'premium';

const EMPTY_ANALYTICS: AdminAnalytics = {
  totals: {
    total_users: 0,
    total_books: 0,
    active_subscriptions: 0,
    total_revenue_paise: 0,
    total_revenue_inr: 0,
    monthly_revenue_paise: 0,
    monthly_revenue_inr: 0,
  },
  charts: {
    revenue_last_6_months: [],
    subscriptions_last_6_months: [],
  },
  notifications: {
    window_days: 7,
    new_users_count: 0,
    new_subscriptions_count: 0,
    recent_users: [],
    recent_subscriptions: [],
  },
};

export default function AdminPage({ onNavigate }: AdminPageProps) {
  const { user, session } = useAuth();
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const [books, setBooks] = useState<EBook[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(initialPlanForm);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  const [bookCategoryFilter, setBookCategoryFilter] = useState('all');
  const [bookAccessFilter, setBookAccessFilter] = useState<BookAccessFilter>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<BookFormState>(initialForm);
  const [categoryName, setCategoryName] = useState('');
  const [coverSource, setCoverSource] = useState<AssetSource>('url');
  const [pdfSource, setPdfSource] = useState<AssetSource>('url');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics>(EMPTY_ANALYTICS);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [notificationWindowDays, setNotificationWindowDays] = useState(7);
  const [exportingUsersCsv, setExportingUsersCsv] = useState(false);
  const [exportingBooksCsv, setExportingBooksCsv] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  const isAdmin = user?.role === 'admin';
  const categoryOptions = Array.from(new Set([
    ...categories.map((category) => category.name),
    form.category,
  ].filter(Boolean)));

  const filteredBooks = books.filter((book) => {
    const matchesTitle = book.title.toLowerCase().includes(bookSearch.trim().toLowerCase());
    const matchesCategory = bookCategoryFilter === 'all' || book.category === bookCategoryFilter;
    const matchesAccess =
      bookAccessFilter === 'all' ||
      (bookAccessFilter === 'free' && Boolean(book.is_free)) ||
      (bookAccessFilter === 'premium' && !book.is_free);

    return matchesTitle && matchesCategory && matchesAccess;
  });

  const resetBookFilters = () => {
    setBookSearch('');
    setBookCategoryFilter('all');
    setBookAccessFilter('all');
  };

  const resetCategoryForm = () => {
    setCategoryName('');
    setEditingCategoryId(null);
  };

  const resetPlanForm = () => {
    setPlanForm(initialPlanForm);
    setEditingPlanId(null);
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingBookId(null);
    setCoverSource('url');
    setPdfSource('url');
    setCoverFile(null);
    setPdfFile(null);
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

  const loadCategories = async () => {
    if (!session?.access_token) {
      setLoadingCategories(false);
      return;
    }

    try {
      const payload = await apiRequest<{ data: Category[] }>('/api/admin/categories', {
        token: session.access_token,
      });
      setCategories(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to fetch categories.');
    } finally {
      setLoadingCategories(false);
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

  const handlePlanEdit = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      amount: String(plan.amount),
      duration_days: String(plan.duration_days),
    });
    setError('');
    setSuccess('');
  };

  const handlePlanSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    const trimmedName = planForm.name.trim();
    const numericAmount = Number(planForm.amount);
    const numericDuration = Number(planForm.duration_days);

    if (!trimmedName) {
      setError('Plan name is required.');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Price must be a positive number.');
      return;
    }

    if (!Number.isFinite(numericDuration) || numericDuration <= 0) {
      setError('Duration must be a positive number of days.');
      return;
    }

    setSavingPlan(true);
    setError('');
    setSuccess('');

    try {
      if (editingPlanId) {
        await apiRequest<{ data: SubscriptionPlan }>(`/api/admin/plans/${editingPlanId}`, {
          method: 'PUT',
          token: session.access_token,
          body: {
            name: trimmedName,
            amount: numericAmount,
            duration_days: numericDuration,
          },
        });
        setSuccess('Plan updated successfully.');
      } else {
        await apiRequest<{ data: SubscriptionPlan }>('/api/admin/plans', {
          method: 'POST',
          token: session.access_token,
          body: {
            name: trimmedName,
            amount: numericAmount,
            duration_days: numericDuration,
          },
        });
        setSuccess('Plan added successfully.');
      }

      resetPlanForm();
      await loadPlans();
      await loadAnalytics();
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'Failed to save plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handlePlanDelete = async (plan: SubscriptionPlan) => {
    const confirmed = window.confirm(`Delete plan "${plan.name}"? This action cannot be undone.`);
    if (!confirmed) return;

    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    setDeletingPlanId(plan.id);
    setError('');
    setSuccess('');

    try {
      await apiRequest(`/api/admin/plans/${plan.id}`, {
        method: 'DELETE',
        token: session.access_token,
      });
      setSuccess('Plan deleted successfully.');
      if (editingPlanId === plan.id) {
        resetPlanForm();
      }
      await loadPlans();
      await loadAnalytics();
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'Failed to delete plan.');
    } finally {
      setDeletingPlanId(null);
    }
  };

  const loadAnalytics = async () => {
    if (!session?.access_token) {
      setAnalyticsLoading(false);
      return;
    }

    try {
      const payload = await apiRequest<{ data: AdminAnalytics }>(`/api/admin/analytics?window_days=${notificationWindowDays}`, {
        token: session.access_token,
      });
      setAnalytics(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to fetch analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleCategoryEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setError('');
    setSuccess('');
  };

  const handleCategorySubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      setError('Category name is required.');
      return;
    }

    setSavingCategory(true);
    setError('');
    setSuccess('');

    try {
      if (editingCategoryId) {
        await apiRequest<{ data: Category }>(`/api/admin/categories/${editingCategoryId}`, {
          method: 'PUT',
          token: session.access_token,
          body: { name: trimmedName },
        });
        setSuccess('Category updated successfully.');
      } else {
        await apiRequest<{ data: Category }>('/api/admin/categories', {
          method: 'POST',
          token: session.access_token,
          body: { name: trimmedName },
        });
        setSuccess('Category added successfully.');
      }

      resetCategoryForm();
      await loadCategories();
      await loadBooks();
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'Failed to save category.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCategoryDelete = async (category: Category) => {
    const usageCount = books.filter((book) => book.category === category.name).length;
    const confirmed = window.confirm(
      usageCount > 0
        ? `This category is used by ${usageCount} book(s). It cannot be deleted until those books are reassigned. Continue?`
        : `Delete category "${category.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    setDeletingCategoryId(category.id);
    setError('');
    setSuccess('');

    try {
      await apiRequest(`/api/admin/categories/${category.id}`, {
        method: 'DELETE',
        token: session.access_token,
      });
      setSuccess('Category deleted successfully.');
      if (editingCategoryId === category.id) {
        resetCategoryForm();
      }
      await loadCategories();
      await loadBooks();
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'Failed to delete category.');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadCategories();
      loadBooks();
      loadPlans();
      setAnalyticsLoading(true);
      loadAnalytics();
    } else {
      setLoading(false);
      setLoadingCategories(false);
      setAnalyticsLoading(false);
    }
  }, [isAdmin, session?.access_token, notificationWindowDays]);

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
      await loadAnalytics();
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
      featured: Boolean(book.featured),
    });
    setCoverSource('url');
    setPdfSource('url');
    setCoverFile(null);
    setPdfFile(null);

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
      if (coverSource === 'url' && !form.cover_url.trim()) {
        setError('Cover image URL is required when URL is selected.');
        setSaving(false);
        return;
      }

      if (pdfSource === 'url' && !form.pdf_url.trim()) {
        setError('PDF URL is required when URL is selected.');
        setSaving(false);
        return;
      }

      if (coverSource === 'upload' && !coverFile) {
        setError('Choose a cover image file when upload is selected.');
        setSaving(false);
        return;
      }

      if (pdfSource === 'upload' && !pdfFile) {
        setError('Choose a PDF file when upload is selected.');
        setSaving(false);
        return;
      }

      const shouldUseFormData = coverSource === 'upload' || pdfSource === 'upload';
      let payload: FormData | BookFormState;
      if (shouldUseFormData) {
        payload = new FormData();
        payload.append('title', form.title);
        payload.append('author', form.author);
        payload.append('category', form.category);
        payload.append('description', form.description);
        payload.append('is_free', String(form.is_free));
        payload.append('featured', String(form.featured));
        payload.append('cover_source', coverSource);
        payload.append('pdf_source', pdfSource);
        if (coverSource === 'url') {
          payload.append('cover_url', form.cover_url);
        } else if (coverFile) {
          payload.append('cover_file', coverFile);
        }
        if (pdfSource === 'url') {
          payload.append('pdf_url', form.pdf_url);
        } else if (pdfFile) {
          payload.append('pdf_file', pdfFile);
        }
      } else {
        payload = { ...form };
      }

      if (editingBookId) {
        await apiRequest<{ data: EBook }>(`/api/admin/books/${editingBookId}`, {
          method: 'PUT',
          token: session.access_token,
          body: payload,
        });
        setSuccess('Book updated successfully.');
      } else {
        await apiRequest<{ data: EBook }>('/api/admin/books', {
          method: 'POST',
          token: session.access_token,
          body: payload,
        });
        setSuccess('Book added successfully.');
      }

      resetForm();
      await loadBooks();
      await loadAnalytics();
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
      await loadAnalytics();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete book.');
    } finally {
      setDeletingBookId(null);
    }
  };

  const downloadAdminCsv = async (path: string, fileName: string) => {
    if (!session?.access_token) {
      setError('Please sign in again to continue.');
      return;
    }

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to export CSV (status ${response.status}).`);
    }

    const csvText = await response.text();
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', fileName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const buildExportQuery = () => {
    if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
      throw new Error('Start date must be before or equal to end date.');
    }

    const params = new URLSearchParams();
    if (exportStartDate) {
      params.set('start_date', exportStartDate);
    }
    if (exportEndDate) {
      params.set('end_date', exportEndDate);
    }

    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const buildExportRangeSuffix = () => {
    if (!exportStartDate && !exportEndDate) {
      return '';
    }

    const start = exportStartDate || 'any';
    const end = exportEndDate || 'any';
    return `-${start}_to_${end}`;
  };

  const handleExportUsersCsv = async () => {
    setError('');
    setSuccess('');
    setExportingUsersCsv(true);

    try {
      const fileDate = new Date().toISOString().slice(0, 10);
      const query = buildExportQuery();
      const rangeSuffix = buildExportRangeSuffix();
      await downloadAdminCsv(`/api/admin/users/export.csv${query}`, `users-${fileDate}${rangeSuffix}.csv`);
      setSuccess('Users CSV exported successfully.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export users CSV.');
    } finally {
      setExportingUsersCsv(false);
    }
  };

  const handleExportBooksCsv = async () => {
    setError('');
    setSuccess('');
    setExportingBooksCsv(true);

    try {
      const fileDate = new Date().toISOString().slice(0, 10);
      const query = buildExportQuery();
      const rangeSuffix = buildExportRangeSuffix();
      await downloadAdminCsv(`/api/admin/books/export.csv${query}`, `books-${fileDate}${rangeSuffix}.csv`);
      setSuccess('Books CSV exported successfully.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export books CSV.');
    } finally {
      setExportingBooksCsv(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  const maxRevenue = Math.max(...analytics.charts.revenue_last_6_months.map((point) => point.value_inr), 1);
  const maxSubscriptions = Math.max(...analytics.charts.subscriptions_last_6_months.map((point) => point.value), 1);
  const points = analytics.charts.subscriptions_last_6_months;
  const linePath = points
    .map((point, index) => {
      const x = points.length <= 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 92 - (point.value / maxSubscriptions) * 80;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

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
          <p className="text-slate-400 text-sm">Manage books with add, edit, delete, and CSV exports for reporting.</p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Start date
              <input
                type="date"
                value={exportStartDate}
                onChange={(event) => setExportStartDate(event.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              End date
              <input
                type="date"
                value={exportEndDate}
                onChange={(event) => setExportEndDate(event.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setExportStartDate('');
                setExportEndDate('');
              }}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-lg text-sm"
            >
              <RotateCcw size={15} className="text-slate-300" />
              Clear Dates
            </button>
            <button
              type="button"
              onClick={handleExportUsersCsv}
              disabled={exportingUsersCsv}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/60 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-lg text-sm"
            >
              <Download size={15} className="text-sky-400" />
              {exportingUsersCsv ? 'Exporting Users...' : 'Export Users CSV'}
            </button>
            <button
              type="button"
              onClick={handleExportBooksCsv}
              disabled={exportingBooksCsv}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/60 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-lg text-sm"
            >
              <Download size={15} className="text-emerald-400" />
              {exportingBooksCsv ? 'Exporting Books...' : 'Export Books CSV'}
            </button>
          </div>
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

        <div className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-white font-semibold flex items-center gap-2"><BarChart3 size={18} className="text-amber-400" /> Analytics Overview</h2>
            <button
              type="button"
              onClick={() => onNavigate('admin-transactions')}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-sm"
            >
              <IndianRupee size={15} className="text-amber-400" />
              View Transactions
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Users</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : analytics.totals.total_users}</p>
                <Users size={18} className="text-sky-400" />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Books</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : analytics.totals.total_books}</p>
                <BookOpen size={18} className="text-emerald-400" />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Active Subscriptions</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : analytics.totals.active_subscriptions}</p>
                <Crown size={18} className="text-amber-400" />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Monthly Revenue</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : formatCurrency(analytics.totals.monthly_revenue_inr)}</p>
                <IndianRupee size={18} className="text-violet-400" />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Revenue</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : formatCurrency(analytics.totals.total_revenue_inr)}</p>
                <IndianRupee size={18} className="text-violet-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-medium">Recent Notifications</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Window</span>
                <select
                  value={notificationWindowDays}
                  onChange={(event) => setNotificationWindowDays(Number(event.target.value))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>
            </div>
            <p className="text-slate-400 text-sm mb-4">New users and new active subscriptions are tracked here for quick admin follow-up.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">New Users</p>
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : analytics.notifications.new_users_count}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">New Subscriptions</p>
                <p className="text-2xl font-bold text-white">{analyticsLoading ? '...' : analytics.notifications.new_subscriptions_count}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4">
                <h4 className="text-slate-200 text-sm font-medium mb-3">Latest Users</h4>
                {analytics.notifications.recent_users.length === 0 ? (
                  <p className="text-slate-500 text-sm">No new users in this window.</p>
                ) : (
                  <ul className="space-y-2">
                    {analytics.notifications.recent_users.map((entry) => (
                      <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="text-slate-200">{entry.name}</p>
                          <p className="text-slate-500 text-xs">{entry.email}</p>
                        </div>
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : 'Unknown'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4">
                <h4 className="text-slate-200 text-sm font-medium mb-3">Latest Subscriptions</h4>
                {analytics.notifications.recent_subscriptions.length === 0 ? (
                  <p className="text-slate-500 text-sm">No new subscriptions in this window.</p>
                ) : (
                  <ul className="space-y-2">
                    {analytics.notifications.recent_subscriptions.map((entry) => (
                      <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="text-slate-200">{entry.user_name}</p>
                          <p className="text-slate-500 text-xs">{entry.plan_name} • {formatCurrency(entry.amount_inr)}</p>
                        </div>
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : 'Unknown'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Revenue in Last 6 Months</h3>
                <TrendingUp size={16} className="text-emerald-400" />
              </div>
              <div className="h-48 flex items-end gap-2">
                {analytics.charts.revenue_last_6_months.map((point) => {
                  const heightPercent = Math.max(8, (point.value_inr / maxRevenue) * 100);
                  return (
                    <div key={point.label} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                      <div className="text-[11px] text-slate-500">{formatCurrency(point.value_inr)}</div>
                      <div className="w-full bg-slate-800 rounded-md overflow-hidden h-32 border border-slate-700">
                        <div
                          className="w-full bg-gradient-to-t from-amber-500 to-orange-400 rounded-md"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400">{point.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Subscriptions in Last 6 Months</h3>
                <Crown size={16} className="text-amber-400" />
              </div>
              <div className="h-48 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                  <line x1="0" y1="92" x2="100" y2="92" stroke="rgb(71 85 105)" strokeWidth="0.6" />
                  <path d={linePath} fill="none" stroke="rgb(245 158 11)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {points.map((point, index) => {
                    const x = points.length <= 1 ? 50 : (index / (points.length - 1)) * 100;
                    const y = 92 - (point.value / maxSubscriptions) * 80;
                    return <circle key={point.label} cx={x} cy={y} r="1.8" fill="rgb(245 158 11)" />;
                  })}
                </svg>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-2 text-center">
                {points.map((point) => (
                  <div key={point.label} className="text-xs">
                    <div className="text-slate-200 font-medium">{point.value}</div>
                    <div className="text-slate-500">{point.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">Book Categories</h2>
          <p className="text-slate-400 text-sm mb-5">Add, rename, and delete the categories used across the library.</p>

          <form onSubmit={handleCategorySubmit} className="flex flex-col md:flex-row gap-3 mb-5">
            <input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
              placeholder="Category name"
              className="flex-1 bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg"
            />
            <button
              type="submit"
              disabled={savingCategory}
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-slate-900 font-semibold px-4 py-2.5 rounded-lg"
            >
              <Plus size={16} />
              {editingCategoryId ? 'Update Category' : 'Add Category'}
            </button>
            {editingCategoryId && (
              <button
                type="button"
                onClick={resetCategoryForm}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-lg border border-slate-700"
              >
                Cancel Edit
              </button>
            )}
          </form>

          {loadingCategories ? (
            <p className="text-slate-500 text-sm">Loading categories...</p>
          ) : categories.length === 0 ? (
            <p className="text-slate-500 text-sm">No categories found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((category) => {
                const usageCount = books.filter((book) => book.category === category.name).length;
                return (
                  <div key={category.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-white font-medium">{category.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">Used by {usageCount} book{usageCount === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCategoryEdit(category)}
                          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-md"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCategoryDelete(category)}
                          disabled={deletingCategoryId === category.id}
                          className="inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-md"
                        >
                          <Trash2 size={13} /> {deletingCategoryId === category.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
              <option value="" disabled>
                {loadingCategories ? 'Loading categories...' : categoryOptions.length === 0 ? 'No categories available' : 'Select Category'}
              </option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-300">Cover Image</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                  <button type="button" onClick={() => setCoverSource('url')} className={`px-3 py-1.5 text-xs font-medium ${coverSource === 'url' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>
                    URL
                  </button>
                  <button type="button" onClick={() => setCoverSource('upload')} className={`px-3 py-1.5 text-xs font-medium ${coverSource === 'upload' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>
                    Upload
                  </button>
                </div>
              </div>
              {coverSource === 'url' ? (
                <input value={form.cover_url} onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))} required placeholder="Cover Image URL" className="w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg" />
              ) : (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                    className="w-full bg-slate-900 border border-slate-600 text-white px-3 py-2.5 rounded-lg file:mr-4 file:rounded-md file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900"
                  />
                  {coverFile ? <p className="text-xs text-slate-400">Selected: {coverFile.name}</p> : <p className="text-xs text-slate-500">Choose an image file to upload.</p>}
                </div>
              )}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-300">PDF</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                  <button type="button" onClick={() => setPdfSource('url')} className={`px-3 py-1.5 text-xs font-medium ${pdfSource === 'url' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>
                    URL
                  </button>
                  <button type="button" onClick={() => setPdfSource('upload')} className={`px-3 py-1.5 text-xs font-medium ${pdfSource === 'upload' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>
                    Upload
                  </button>
                </div>
              </div>
              {pdfSource === 'url' ? (
                <input value={form.pdf_url} onChange={(e) => setForm((f) => ({ ...f, pdf_url: e.target.value }))} required placeholder="PDF URL" className="w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg" />
              ) : (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="w-full bg-slate-900 border border-slate-600 text-white px-3 py-2.5 rounded-lg file:mr-4 file:rounded-md file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900"
                  />
                  {pdfFile ? <p className="text-xs text-slate-400">Selected: {pdfFile.name}</p> : <p className="text-xs text-slate-500">Choose a PDF file to upload.</p>}
                </div>
              )}
            </div>

            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required placeholder="Description" rows={3} className="bg-slate-800 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg md:col-span-2" />

            <label className="inline-flex items-center gap-2 text-slate-300 text-sm md:col-span-2">
              <input type="checkbox" checked={form.is_free} onChange={(e) => setForm((f) => ({ ...f, is_free: e.target.checked }))} className="accent-amber-500" />
              Mark as free book
            </label>

            <label className="inline-flex items-center gap-2 text-slate-300 text-sm md:col-span-2">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} className="accent-amber-500" />
              Mark as featured book
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
          <h2 className="text-white font-semibold mb-2">Subscription Access Plans</h2>
          <p className="text-slate-400 text-sm mb-5">Create, update, and delete the plans users can subscribe to.</p>

          <form onSubmit={handlePlanSubmit} className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-white font-medium">{editingPlanId ? 'Edit Plan' : 'Add New Plan'}</h3>
              {editingPlanId && (
                <button
                  type="button"
                  onClick={resetPlanForm}
                  className="text-xs font-medium text-amber-300 hover:text-amber-200"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={planForm.name}
                onChange={(e) => setPlanForm((current) => ({ ...current, name: e.target.value }))}
                required
                placeholder="Plan name"
                className="bg-slate-900 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg"
              />
              <input
                type="number"
                min={1}
                value={planForm.amount}
                onChange={(e) => setPlanForm((current) => ({ ...current, amount: e.target.value }))}
                required
                placeholder="Price (paise)"
                className="bg-slate-900 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg"
              />
              <input
                type="number"
                min={1}
                value={planForm.duration_days}
                onChange={(e) => setPlanForm((current) => ({ ...current, duration_days: e.target.value }))}
                required
                placeholder="Duration (days)"
                className="bg-slate-900 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 rounded-lg"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                disabled={savingPlan}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-slate-900 font-semibold px-4 py-2.5 rounded-lg"
              >
                <Plus size={16} />
                {editingPlanId ? 'Update Plan' : 'Add Plan'}
              </button>
              {editingPlanId && (
                <button
                  type="button"
                  onClick={resetPlanForm}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2.5 rounded-lg border border-slate-600"
                >
                  Reset
                </button>
              )}
            </div>
          </form>

          <div className="space-y-4">
            {plans.length === 0 ? (
              <p className="text-slate-500 text-sm">No plans found.</p>
            ) : (
              plans.map((plan) => (
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
                      <label className="block text-xs text-slate-400 mb-1">Price (paise)</label>
                      <input
                        value={plan.amount}
                        readOnly
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg"
                      />
                    </div>
                    <div className="w-full md:w-44">
                      <label className="block text-xs text-slate-400 mb-1">Duration (days)</label>
                      <input
                        value={plan.duration_days}
                        readOnly
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlanEdit(plan)}
                        className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlanDelete(plan)}
                        disabled={deletingPlanId === plan.id}
                        className="inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm"
                      >
                        <Trash2 size={13} /> {deletingPlanId === plan.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-amber-400" />
                  <h2 className="text-white font-semibold">Books Table</h2>
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  Showing {filteredBooks.length} of {books.length} books.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 w-full lg:max-w-4xl">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={bookSearch}
                    onChange={(event) => setBookSearch(event.target.value)}
                    placeholder="Search by title"
                    className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-lg text-sm"
                  />
                </div>
                <select
                  value={bookCategoryFilter}
                  onChange={(event) => setBookCategoryFilter(event.target.value)}
                  className="bg-slate-800 border border-slate-600 text-white px-3 py-2 rounded-lg text-sm"
                >
                  <option value="all">All Categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <select
                  value={bookAccessFilter}
                  onChange={(event) => setBookAccessFilter(event.target.value as BookAccessFilter)}
                  className="bg-slate-800 border border-slate-600 text-white px-3 py-2 rounded-lg text-sm"
                >
                  <option value="all">All Access Types</option>
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
                <button
                  type="button"
                  onClick={resetBookFilters}
                  className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 py-2 rounded-lg text-sm"
                >
                  <RotateCcw size={14} />
                  Reset Filters
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-800/60 border-b border-slate-700">
                <tr>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Title</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Author</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Category</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Access</th>
                  <th className="text-left text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Featured</th>
                  <th className="text-right text-slate-400 text-xs font-semibold uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-slate-500 text-sm px-5 py-6">Loading books...</td>
                  </tr>
                ) : books.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-slate-500 text-sm px-5 py-6">No books found.</td>
                  </tr>
                ) : filteredBooks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-slate-500 text-sm px-5 py-6">No books match the selected filters.</td>
                  </tr>
                ) : (
                  filteredBooks.map((book) => (
                    <tr key={book.id} className="border-b border-slate-800 last:border-0">
                      <td className="px-5 py-4 text-sm text-white font-medium">{book.title}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{book.author}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{book.category}</td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${book.is_free ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>
                          {book.is_free ? 'Free' : 'Premium'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${book.featured ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
                          {book.featured ? 'Featured' : 'Normal'}
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
