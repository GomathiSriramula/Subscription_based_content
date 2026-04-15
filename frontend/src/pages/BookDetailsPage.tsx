import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Heart, Lock, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isFavoriteBook, toggleFavoriteBook } from '../lib/favorites';
import { trackRecentlyOpenedBook } from '../lib/recentBooks';
import { EBook } from '../types';
import PDFViewer from '../components/books/PDFViewer';

interface BookDetailsPageProps {
  onNavigate: (page: string) => void;
  book: EBook | null;
}

export default function BookDetailsPage({ onNavigate, book }: BookDetailsPageProps) {
  const { isSubscribed, user } = useAuth();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [favoriteVersion, setFavoriteVersion] = useState(0);

  const isAdmin = user?.role === 'admin';
  const canRead = useMemo(() => {
    if (!book) return false;
    const lockedFlag = (book as EBook & { is_locked?: boolean }).is_locked;
    if (typeof lockedFlag === 'boolean') {
      return !lockedFlag;
    }
    return isAdmin || isSubscribed || Boolean(book.is_free);
  }, [book, isAdmin, isSubscribed]);

  const isFavorite = useMemo(() => {
    if (!user?.id || !book?.id) {
      return false;
    }

    return isFavoriteBook(user.id, book.id);
  }, [user?.id, book?.id, favoriteVersion]);

  if (!book) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <button
            onClick={() => onNavigate('books')}
            className="inline-flex items-center gap-2 text-slate-300 hover:text-white mb-6"
          >
            <ArrowLeft size={16} />
            Back to Library
          </button>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 text-center">
            <h1 className="text-white text-xl font-semibold mb-2">Book Not Found</h1>
            <p className="text-slate-400 text-sm mb-5">Select a book from the library to view full details.</p>
            <button
              onClick={() => onNavigate('books')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded-lg"
            >
              Open Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {isViewerOpen && <PDFViewer book={book} onClose={() => setIsViewerOpen(false)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <button
          onClick={() => onNavigate('books')}
          className="inline-flex items-center gap-2 text-slate-300 hover:text-white mb-6"
        >
          <ArrowLeft size={16} />
          Back to Library
        </button>

        <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0">
            <div className="bg-slate-800/60 p-6">
              <img
                src={book.cover_url}
                alt={book.title}
                className="w-full h-auto max-h-[420px] object-cover rounded-xl border border-slate-700"
              />
            </div>

            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2.5 py-1 rounded-full">
                  <Tag size={11} />
                  {book.category}
                </span>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    canRead
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {canRead ? 'Unlocked' : 'Locked'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">{book.title}</h1>
              <p className="text-slate-400 text-sm sm:text-base mb-6">By {book.author}</p>

              <div className="mb-8">
                <h2 className="text-white text-sm font-semibold uppercase tracking-wide mb-3">Description</h2>
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{book.description}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!user?.id || !book) {
                    return;
                  }

                  toggleFavoriteBook(user.id, book);
                  setFavoriteVersion((current) => current + 1);
                }}
                className={`mb-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  isFavorite
                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-rose-300 hover:border-rose-500/30'
                }`}
              >
                <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>

              <button
                onClick={() => {
                  if (!canRead || !book) {
                    return;
                  }

                  if (user?.id) {
                    trackRecentlyOpenedBook(user.id, book);
                  }

                  setIsViewerOpen(true);
                }}
                disabled={!canRead}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg font-semibold transition-colors ${
                  canRead
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {canRead ? (
                  <>
                    <BookOpen size={16} />
                    Read Book
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    Subscribe to Read
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
