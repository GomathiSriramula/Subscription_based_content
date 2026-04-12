import { useMemo } from 'react';
import { X, ExternalLink, BookOpen } from 'lucide-react';
import { EBook } from '../../types';

interface PDFViewerProps {
  book: EBook;
  onClose: () => void;
}

export default function PDFViewer({ book, onClose }: PDFViewerProps) {
  const directViewerUrl = useMemo(() => `${book.pdf_url}#view=FitH`, [book.pdf_url]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
            <BookOpen size={16} className="text-amber-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{book.title}</p>
            <p className="text-slate-400 text-xs">{book.author}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={book.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ExternalLink size={13} />
            Open in tab
          </a>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={15} />
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <iframe
          src={directViewerUrl}
          className="w-full h-full border-0"
          title={book.title}
        />
      </div>
    </div>
  );
}
