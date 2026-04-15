import { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  BookOpen,
  AlertCircle,
  CheckCircle,
  CreditCard,
  Zap,
  ChevronRight,
  User,
  Clock,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { FavoriteBookItem, getFavoriteBooks, toggleFavoriteBook } from '../lib/favorites';
import { getRecentOpenedBooks, RecentBookItem, trackRecentlyOpenedBook } from '../lib/recentBooks';
import { EBook, RazorpayPaymentResponse, SubscriptionPlan } from '../types';
import BookCard from '../components/books/BookCard';
import PDFViewer from '../components/books/PDFViewer';

interface DashboardPageProps {
  onNavigate: (page: string) => void;
  onOpenBookDetails?: (book: EBook) => void;
}

interface UserBook extends EBook {
  is_locked?: boolean;
  is_unlocked?: boolean;
}

interface UserBooksResponse {
  data: UserBook[];
}

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function DashboardPage({ onNavigate, onOpenBookDetails }: DashboardPageProps) {
  const { user, subscription, isSubscribed, refreshSubscription, session } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [bookCount, setBookCount] = useState(0);
  const [books, setBooks] = useState<UserBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<EBook | null>(null);
  const [booksSearch, setBooksSearch] = useState('');
  const [booksCategory, setBooksCategory] = useState('All');
  const [recentOpenedBooks, setRecentOpenedBooks] = useState<RecentBookItem[]>([]);
  const [favoriteBooks, setFavoriteBooks] = useState<FavoriteBookItem[]>([]);

  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  useEffect(() => {
    const loadDashboardBooks = async () => {
      setBooksLoading(true);
      try {
        if (session?.access_token) {
          const payload = await apiRequest<UserBooksResponse>('/api/books/user', {
            token: session.access_token,
          });
          setBooks(payload.data);
          setBookCount(payload.data.length);
        } else {
          const payload = await apiRequest<{ data: UserBook[] }>('/api/books');
          setBooks(payload.data);
          setBookCount(payload.data.length);
        }
      } finally {
        setBooksLoading(false);
      }
    };

    loadDashboardBooks();
  }, [session?.access_token, isSubscribed]);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const payload = await apiRequest<{ data: SubscriptionPlan[] }>('/api/plans');
        setPlans(payload.data);
        if (!selectedPlan && payload.data.length > 0) {
          setSelectedPlan(payload.data[0].id);
        }
      } catch {
        setPlans([]);
      }
    };

    loadPlans();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setRecentOpenedBooks([]);
      return;
    }

    setRecentOpenedBooks(getRecentOpenedBooks(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setFavoriteBooks([]);
      return;
    }

    setFavoriteBooks(getFavoriteBooks(user.id));
  }, [user?.id]);

  const handleSubscribe = useCallback(async () => {
    setPaymentError('');
    setPaymentSuccess('');
    setPaymentLoading(true);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setPaymentError('Failed to load payment gateway. Please try again.');
      setPaymentLoading(false);
      return;
    }

    if (!session?.access_token) {
      setPaymentError('Please sign in again to continue.');
      setPaymentLoading(false);
      return;
    }

    if (!selectedPlan) {
      setPaymentError('No subscription plan available. Please contact admin.');
      setPaymentLoading(false);
      return;
    }

    let orderData: { keyId: string; amount: number; currency: string; orderId: string };
    try {
      orderData = await apiRequest('/api/payments/create-order', {
        method: 'POST',
        token: session.access_token,
        body: { plan: selectedPlan },
      });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Failed to create order.');
      setPaymentLoading(false);
      return;
    }

    setPaymentLoading(false);

    const isTestMode = orderData.keyId.startsWith('rzp_test_');

    const options = {
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'PageVault',
      description: `${plans.find((plan) => plan.id === selectedPlan)?.name || 'Subscription'} Plan`,
      order_id: orderData.orderId,
      handler: async (response: RazorpayPaymentResponse) => {
        setPaymentLoading(true);
        try {
          const verifyData = await apiRequest<{ success: boolean; error?: string }>('/api/payments/verify', {
            method: 'POST',
            token: session.access_token,
            body: response,
          });

          if (verifyData.success) {
            setPaymentSuccess('Subscription activated! Enjoy unlimited reading.');
            await refreshSubscription();
          } else {
            setPaymentError(verifyData.error || 'Payment verification failed.');
          }
        } catch (error) {
          setPaymentError(error instanceof Error ? error.message : 'Payment verification failed.');
        } finally {
          setPaymentLoading(false);
        }
      },
      prefill: {
        name: user?.user_metadata?.full_name || '',
        email: user?.email || '',
      },
      theme: { color: '#f59e0b' },
      modal: {
        ondismiss: () => {
          setPaymentLoading(false);
        },
      },
      method: isTestMode
        ? {
            card: false,
            netbanking: true,
            upi: true,
            wallet: true,
            paylater: true,
          }
        : undefined,
    };

    if (!window.Razorpay) {
      setPaymentError('Razorpay SDK is unavailable. Please refresh and try again.');
      return;
    }

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      const description = response?.error?.description || 'Payment failed. Please try another method.';
      const unsupportedInternational = description.toLowerCase().includes('international cards are not supported');

      setPaymentError(
        unsupportedInternational
          ? 'Cards are disabled in test mode for this account. Please pay using Netbanking, UPI, Wallet, or Pay Later.'
          : description
      );
      setPaymentLoading(false);
    });
    rzp.open();
  }, [session, user, selectedPlan, refreshSubscription]);

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const daysLeft = () => {
    if (!subscription?.expiry_date) return 0;
    const diff = new Date(subscription.expiry_date).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const remainingDays = daysLeft();

  const getSubscriptionStatusLabel = () => {
    if (!subscription) return 'Inactive';
    if (subscription.status === 'pending') return 'Pending';
    if (subscription.status === 'expired' || (subscription.expiry_date && remainingDays <= 0)) return 'Expired';
    return 'Active';
  };

  const getSubscriptionStatusBadgeClasses = () => {
    const status = getSubscriptionStatusLabel();
    if (status === 'Active') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (status === 'Pending') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (status === 'Expired') return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getPlanLabel = () => {
    if (!subscription?.plan) return 'N/A';
    if (subscription.plan === 'monthly') return 'Monthly';
    if (subscription.plan === 'yearly') return 'Yearly';
    return subscription.plan
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const booksCategories = [
    'All',
    ...Array.from(new Set(books.map((book) => book.category).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
  ];

  const filteredBooks = books.filter((book) => {
    const query = booksSearch.trim().toLowerCase();
    const matchesSearch = !query || (
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query)
    );
    const matchesCategory = booksCategory === 'All' || book.category === booksCategory;
    return matchesSearch && matchesCategory;
  });

  const unlockedCount = books.filter((book) => !book.is_locked).length;
  const quickAccessBooks = books
    .filter((book) => (isAdmin ? true : !book.is_locked))
    .slice(0, 4);
  const featuredBooks = filteredBooks.filter((book) => Boolean(book.featured));
  const regularBooks = filteredBooks.filter((book) => !book.featured);

  const handleOpenBook = (book: EBook) => {
    if (user?.id) {
      setRecentOpenedBooks(trackRecentlyOpenedBook(user.id, book));
    }

    if (onOpenBookDetails) {
      onOpenBookDetails(book);
      return;
    }
    setSelectedBook(book);
  };

  const handleToggleFavorite = (book: EBook) => {
    if (!user?.id) {
      return;
    }

    setFavoriteBooks(toggleFavoriteBook(user.id, book));
  };

  const favoriteBookIds = new Set(favoriteBooks.map((item) => item.bookId));

  return (
    <div className="min-h-screen bg-slate-950">
      {selectedBook && <PDFViewer book={selectedBook} onClose={() => setSelectedBook(null)} />}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700">
              <User size={18} className="text-slate-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Welcome back, {user?.user_metadata?.full_name?.split(' ')[0] || 'Reader'}
              </h1>
              <p className="text-slate-500 text-sm">{user?.email}</p>
            </div>
          </div>
        </div>

        {!isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold">Subscription Status</h2>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getSubscriptionStatusBadgeClasses()}`}>
                  {getSubscriptionStatusLabel()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Plan</p>
                  <p className="text-slate-200 font-medium">{isSubscribed ? getPlanLabel() : 'No Plan'}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Expiry Date</p>
                  <p className="text-slate-200 font-medium">{isSubscribed ? formatDate(subscription?.expiry_date ?? null) : 'N/A'}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Days Left</p>
                  <p className={`font-medium ${remainingDays > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {remainingDays}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold">Quick Access Books</h2>
                <button
                  onClick={() => onNavigate('books')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  View All
                </button>
              </div>

              {booksLoading ? (
                <p className="text-slate-500 text-sm">Loading quick access books...</p>
              ) : quickAccessBooks.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  {isSubscribed
                    ? 'No books are available right now.'
                    : 'Subscribe to unlock quick access to premium books.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {quickAccessBooks.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors"
                    >
                      <p className="text-slate-200 text-sm font-medium line-clamp-1">{book.title}</p>
                      <p className="text-slate-500 text-xs line-clamp-1">{book.author}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold">Recently Opened</h2>
                <span className="text-xs text-slate-500">{recentOpenedBooks.length}</span>
              </div>

              {recentOpenedBooks.length === 0 ? (
                <p className="text-slate-500 text-sm">Books you open will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {recentOpenedBooks.slice(0, 5).map((book) => (
                    <button
                      key={book.bookId}
                      onClick={() => {
                        const matchedBook = books.find((entry) => entry.id === book.bookId);
                        if (matchedBook) {
                          handleOpenBook(matchedBook);
                        } else {
                          onNavigate('books');
                        }
                      }}
                      className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2.5 transition-colors"
                    >
                      <p className="text-slate-200 text-sm font-medium line-clamp-1">{book.title}</p>
                      <p className="text-slate-500 text-xs line-clamp-1">{book.author}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {!isAdmin && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Subscription</span>
                <Crown size={18} className={isSubscribed ? 'text-amber-400' : 'text-slate-600'} />
              </div>
              <p className={`text-xl font-bold ${isSubscribed ? 'text-amber-400' : 'text-slate-500'}`}>
                {isSubscribed ? (subscription?.plan === 'yearly' ? 'Yearly' : 'Monthly') : 'Inactive'}
              </p>
              <p className="text-slate-500 text-xs mt-1">{isSubscribed ? 'Active plan' : 'No active plan'}</p>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-sm">Books Available</span>
              <BookOpen size={18} className="text-sky-400" />
            </div>
            <p className="text-xl font-bold text-white">{bookCount === 0 ? '--' : isAdmin ? bookCount : `${unlockedCount}/${bookCount}`}</p>
            <p className="text-slate-500 text-xs mt-1">{isAdmin ? 'Admin full access' : 'Free + subscription based access'}</p>
          </div>

          {!isAdmin && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">Days Remaining</span>
                <Clock size={18} className="text-emerald-400" />
              </div>
              <p className={`text-xl font-bold ${remainingDays > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {remainingDays}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {isSubscribed ? `Expires ${formatDate(subscription?.expiry_date ?? null)}` : 'Not subscribed'}
              </p>
            </div>
          )}
        </div>

        {!isAdmin && isSubscribed && (
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle size={20} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-white font-semibold mb-1">Subscription Active</h2>
                <p className="text-slate-400 text-sm mb-3">You have full access to all eBooks in the library.</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Started</span>
                    <span className="text-slate-300 ml-2">{formatDate(subscription?.start_date ?? null)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Expires</span>
                    <span className="text-slate-300 ml-2">{formatDate(subscription?.expiry_date ?? null)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Days Left</span>
                    <span className="text-emerald-300 ml-2 font-medium">{remainingDays}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Plan</span>
                    <span className="text-amber-400 ml-2 capitalize">{subscription?.plan}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onNavigate('books')}
                className="flex items-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Browse Books <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {!isAdmin && !isSubscribed && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Crown size={20} className="text-amber-400" />
              <h2 className="text-white font-semibold text-lg">Unlock Full Library Access</h2>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Get unlimited access to all {bookCount} eBooks with a PageVault subscription.
            </p>

            {paymentError && (
              <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
                <AlertCircle size={16} className="shrink-0" />
                {paymentError}
              </div>
            )}
            {paymentSuccess && (
              <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg mb-4">
                <CheckCircle size={16} className="shrink-0" />
                {paymentSuccess}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-5">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative border rounded-xl p-4 text-left transition-all ${
                    selectedPlan === plan.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                  }`}
                >
                  <p className="text-white font-semibold capitalize mb-0.5">{plan.name}</p>
                  <p className="text-2xl font-bold text-amber-400">₹{Math.round(plan.amount / 100).toLocaleString('en-IN')}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{plan.duration_days} days access</p>
                </button>
              ))}
            </div>

            <button
              onClick={handleSubscribe}
              disabled={paymentLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-900 font-semibold py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25 flex items-center justify-center gap-2"
            >
              {paymentLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard size={18} />
                  Subscribe with Razorpay
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-5 mt-4">
              {['Unlimited access', 'Cancel anytime', 'Secure payment'].map((feature) => (
                <div key={feature} className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <Zap size={11} className="text-amber-500" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Quick Access</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onNavigate('books')}
              className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-sky-500/20 rounded-lg flex items-center justify-center">
                <BookOpen size={18} className="text-sky-400" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Browse Library</p>
                <p className="text-slate-500 text-xs">{bookCount} books available</p>
              </div>
              <ChevronRight size={16} className="text-slate-600 ml-auto group-hover:text-slate-400 transition-colors" />
            </button>

            {!isAdmin && (
              <button
                onClick={() => !isSubscribed && onNavigate('subscription')}
                disabled={isSubscribed}
                className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-all text-left group disabled:cursor-default"
              >
                <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                  <Crown size={18} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{isSubscribed ? 'Active Plan' : 'Get Subscription'}</p>
                  <p className="text-slate-500 text-xs">
                    {isSubscribed ? `Expires ${formatDate(subscription?.expiry_date ?? null)}` : 'Starting ₹299/month'}
                  </p>
                </div>
                {!isSubscribed && (
                  <ChevronRight size={16} className="text-slate-600 ml-auto group-hover:text-slate-400 transition-colors" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Favorites</h3>
            <span className="text-slate-500 text-xs">{favoriteBooks.length} saved</span>
          </div>

          {favoriteBooks.length === 0 ? (
            <p className="text-slate-500 text-sm mb-2">Mark books as favorites to find them quickly later.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
              {favoriteBooks.slice(0, 6).map((favorite) => {
                const matchedBook = books.find((book) => book.id === favorite.bookId);

                return (
                  <button
                    key={favorite.bookId}
                    onClick={() => {
                      if (matchedBook) {
                        handleOpenBook(matchedBook);
                        return;
                      }

                      onNavigate('books');
                    }}
                    className="text-left bg-slate-800 border border-slate-700 rounded-lg p-3 hover:bg-slate-700 transition-colors"
                  >
                    <p className="text-slate-100 text-sm font-medium line-clamp-1">{favorite.title}</p>
                    <p className="text-slate-500 text-xs line-clamp-1 mt-0.5">{favorite.author}</p>
                    <p className="text-amber-300 text-xs mt-1">{favorite.category}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Your Books</h3>
            <span className="text-slate-500 text-xs">{isAdmin ? 'Admin full access' : 'Locked and unlocked by subscription'}</span>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={booksSearch}
                onChange={(event) => setBooksSearch(event.target.value)}
                placeholder="Search books by title or author..."
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-sm"
              />
            </div>
            <select
              value={booksCategory}
              onChange={(event) => setBooksCategory(event.target.value)}
              className="bg-slate-800 border border-slate-700 text-white px-3 py-2.5 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm"
            >
              {booksCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {booksLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="bg-slate-800 border border-slate-700 rounded-xl h-64 animate-pulse" />
              ))}
            </div>
          ) : books.length === 0 ? (
            <p className="text-slate-500 text-sm">No books available right now.</p>
          ) : filteredBooks.length === 0 ? (
            <p className="text-slate-500 text-sm">No books match your search or selected category.</p>
          ) : (
            <div className="space-y-5">
              {featuredBooks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-300 mb-3">Featured</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featuredBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        isSubscribed={isSubscribed || isAdmin}
                        hideAccessStatus={isAdmin}
                        onRead={handleOpenBook}
                        isFavorite={favoriteBookIds.has(book.id)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}

              {regularBooks.length > 0 && (
                <div>
                  {featuredBooks.length > 0 && <h4 className="text-sm font-semibold text-slate-300 mb-3">More Books</h4>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {regularBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        isSubscribed={isSubscribed || isAdmin}
                        hideAccessStatus={isAdmin}
                        onRead={handleOpenBook}
                        isFavorite={favoriteBookIds.has(book.id)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <button onClick={() => onNavigate('books')} className="text-sm text-amber-400 hover:text-amber-300 font-medium">
              View full library
            </button>
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-4 text-center">
            <p className="text-slate-600 text-xs">Powered by Razorpay (Test Mode) — Use Netbanking/UPI/Wallet test methods</p>
          </div>
        )}
      </div>
    </div>
  );
}
