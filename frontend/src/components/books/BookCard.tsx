import { Lock, BookOpen, Tag } from 'lucide-react';
import { EBook } from '../../types';

interface BookCardProps {
  book: EBook;
  isSubscribed: boolean;
  onRead: (book: EBook) => void;
  hideAccessStatus?: boolean;
}

export default function BookCard({ book, isSubscribed, onRead, hideAccessStatus = false }: BookCardProps) {
  const canRead =
    typeof (book as EBook & { is_locked?: boolean }).is_locked === 'boolean'
      ? !(book as EBook & { is_locked?: boolean }).is_locked
      : isSubscribed || Boolean(book.is_free);

  return (
    <div className="group bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-500 transition-all duration-300 hover:shadow-2xl hover:shadow-slate-900/50 flex flex-col">
      <div className="relative overflow-hidden h-48">
        <img
          src={book.cover_url}
          alt={book.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
        {!hideAccessStatus && (
          <div className="absolute top-3 right-3">
            {canRead ? (
              <span className="flex items-center gap-1 bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                <BookOpen size={11} />
                {book.is_free && !isSubscribed ? 'Free' : 'Unlocked'}
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm text-slate-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-600">
                <Lock size={11} />
                Locked
              </span>
            )}
          </div>
        )}
        <div className="absolute bottom-3 left-3">
          <span className="flex items-center gap-1 bg-slate-900/70 backdrop-blur-sm text-amber-400 text-xs px-2 py-0.5 rounded-full">
            <Tag size={10} />
            {book.category}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-white font-semibold text-base leading-snug line-clamp-2 mb-1">
          {book.title}
        </h3>
        <p className="text-slate-400 text-sm mb-2">{book.author}</p>
        <p className="text-slate-500 text-xs leading-relaxed line-clamp-3 flex-1">
          {book.description}
        </p>
        <button
          onClick={() => canRead && onRead(book)}
          disabled={!canRead}
          className={`mt-4 w-full py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            canRead
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 hover:shadow-lg hover:shadow-amber-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {canRead ? (
            <>
              <BookOpen size={15} />
              Read Now
            </>
          ) : (
            <>
              <Lock size={15} />
              Subscribe to Read
            </>
          )}
        </button>
      </div>
    </div>
  );
}
