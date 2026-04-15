import { EBook } from '../types';

const FAVORITE_BOOKS_STORAGE_KEY = 'pagevault_favorite_books';

export interface FavoriteBookItem {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string;
  category: string;
  favoritedAt: string;
}

type FavoriteBooksStore = Record<string, FavoriteBookItem[]>;

function readStore(): FavoriteBooksStore {
  try {
    const raw = localStorage.getItem(FAVORITE_BOOKS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as FavoriteBooksStore;
  } catch {
    return {};
  }
}

function writeStore(store: FavoriteBooksStore) {
  localStorage.setItem(FAVORITE_BOOKS_STORAGE_KEY, JSON.stringify(store));
}

export function getFavoriteBooks(userId: string): FavoriteBookItem[] {
  if (!userId) {
    return [];
  }

  const store = readStore();
  const books = Array.isArray(store[userId]) ? store[userId] : [];
  return books
    .filter((item) => item && item.bookId && item.title)
    .sort((left, right) => new Date(right.favoritedAt).getTime() - new Date(left.favoritedAt).getTime());
}

export function isFavoriteBook(userId: string, bookId: string): boolean {
  if (!userId || !bookId) {
    return false;
  }

  return getFavoriteBooks(userId).some((item) => item.bookId === bookId);
}

export function toggleFavoriteBook(userId: string, book: EBook): FavoriteBookItem[] {
  if (!userId || !book?.id) {
    return [];
  }

  const store = readStore();
  const current = Array.isArray(store[userId]) ? store[userId] : [];
  const existing = current.find((item) => item.bookId === book.id);

  if (existing) {
    store[userId] = current.filter((item) => item.bookId !== book.id);
    writeStore(store);
    return store[userId];
  }

  const nextItem: FavoriteBookItem = {
    bookId: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.cover_url,
    category: book.category,
    favoritedAt: new Date().toISOString(),
  };

  store[userId] = [nextItem, ...current.filter((item) => item.bookId !== book.id)];
  writeStore(store);
  return store[userId];
}
