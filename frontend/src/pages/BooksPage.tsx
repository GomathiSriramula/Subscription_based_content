import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, BookOpen, Lock, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { EBook } from '../types';
import BookCard from '../components/books/BookCard';
import PDFViewer from '../components/books/PDFViewer';

interface BooksPageProps {
  onNavigate: (page: string) => void;
}

export default function BooksPage({ onNavigate }: BooksPageProps) {
  const { isSubscribed, session, user } = useAuth();
  const [books, setBooks] = useState<EBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedBook, setSelectedBook] = useState<EBook | null>(null);
  const [categories, setCategories] = useState<string[]>(['All']);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const payload = session?.access_token
          ? await apiRequest<{ data: EBook[] }>('/api/books/user', { token: session.access_token })
          : await apiRequest<{ data: EBook[] }>('/api/books');
        setBooks(payload.data);
        const cats = ['All', ...Array.from(new Set(payload.data.map((b: EBook) => b.category)))];
        setCategories(cats);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, [session?.access_token]);

  const filtered = books.filter(b => {
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || b.category === category;
    return matchSearch && matchCat;
  });

  const freeBooksCount = books.filter((b) => Boolean(b.is_free)).length;
  const unlockedCount = books.filter((b) => !(b as EBook & { is_locked?: boolean }).is_locked).length;
  const lockedCount = books.length - unlockedCount;
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-950">
      {selectedBook && (
        <PDFViewer book={selectedBook} onClose={() => setSelectedBook(null)} />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Library</h1>
            <p className="text-slate-400 text-sm">
              {isAdmin
                ? `Admin access to all ${books.length} books`
                : isSubscribed
                ? `Full access to all ${books.length} books`
                : `${freeBooksCount} free books available. Subscribe to unlock ${lockedCount} premium books`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
                <BookOpen size={14} className="text-emerald-400" />
                <span className="text-white text-sm font-medium">{books.length}</span>
                <span className="text-slate-500 text-sm">total</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
                  <BookOpen size={14} className="text-emerald-400" />
                  <span className="text-white text-sm font-medium">{unlockedCount}</span>
                  <span className="text-slate-500 text-sm">unlocked</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
                  <Lock size={14} className="text-slate-500" />
                  <span className="text-white text-sm font-medium">{lockedCount}</span>
                  <span className="text-slate-500 text-sm">locked</span>
                </div>
              </>
            )}
          </div>
        </div>

        {!isSubscribed && !isAdmin && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Crown size={16} className="text-amber-400" />
              </div>
              <p className="text-amber-300 text-sm">
                <span className="font-semibold">Free books are unlocked</span> — Subscribe starting at ₹299/month to access all premium titles.
              </p>
            </div>
            <button
              onClick={() => onNavigate('dashboard')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
            >
              Get Subscription
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or author..."
              className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-slate-500 flex-shrink-0" />
            <div className="flex gap-1.5 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    category === cat
                      ? 'bg-amber-500 text-slate-900'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden animate-pulse">
                <div className="h-48 bg-slate-800" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-800 rounded w-1/2" />
                  <div className="h-3 bg-slate-800 rounded w-full mt-2" />
                  <div className="h-3 bg-slate-800 rounded w-5/6" />
                  <div className="h-9 bg-slate-800 rounded-lg mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500">No books found matching your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(book => (
              <BookCard
                key={book.id}
                book={book}
                isSubscribed={isSubscribed}
                hideAccessStatus={isAdmin}
                onRead={setSelectedBook}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
