import { EBook } from '../types';

const RECENT_BOOKS_STORAGE_KEY = 'pagevault_recent_books';
const MAX_RECENT_BOOKS = 8;

export interface RecentBookItem {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string;
  openedAt: string;
}

type RecentBooksStore = Record<string, RecentBookItem[]>;

function readStore(): RecentBooksStore {
  try {
    const raw = localStorage.getItem(RECENT_BOOKS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as RecentBooksStore;
  } catch {
    return {};
  }
}

function writeStore(store: RecentBooksStore) {
  localStorage.setItem(RECENT_BOOKS_STORAGE_KEY, JSON.stringify(store));
}

export function getRecentOpenedBooks(userId: string): RecentBookItem[] {
  if (!userId) {
    return [];
  }

  const store = readStore();
  const books = Array.isArray(store[userId]) ? store[userId] : [];
  return books
    .filter((item) => item && item.bookId && item.title)
    .sort((left, right) => new Date(right.openedAt).getTime() - new Date(left.openedAt).getTime());
}

export function trackRecentlyOpenedBook(userId: string, book: EBook): RecentBookItem[] {
  if (!userId || !book?.id) {
    return [];
  }

  const store = readStore();
  const current = Array.isArray(store[userId]) ? store[userId] : [];

  const nextItem: RecentBookItem = {
    bookId: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.cover_url,
    openedAt: new Date().toISOString(),
  };

  const next = [
    nextItem,
    ...current.filter((item) => item.bookId !== book.id),
  ].slice(0, MAX_RECENT_BOOKS);

  store[userId] = next;
  writeStore(store);

  return next;
}
