import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Header from './components/layout/Header';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import BooksPage from './pages/BooksPage';
import AdminPage from './pages/AdminPage';

type Page = 'home' | 'login' | 'register' | 'dashboard' | 'books' | 'admin';
type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'pagevault_theme';

function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function AppInner() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!loading) {
      if (user && (page === 'home' || page === 'login' || page === 'register')) {
        setPage('dashboard');
      }
    }
  }, [user, loading]);

  const navigate = (p: string) => setPage(p as Page);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading PageVault...</p>
        </div>
      </div>
    );
  }

  const requireAuth = (content: JSX.Element) => {
    if (!user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return content;
  };

  const requireAdmin = (content: JSX.Element) => {
    if (!user) {
      return <LoginPage onNavigate={navigate} />;
    }
    if (user.role !== 'admin') {
      return <DashboardPage onNavigate={navigate} />;
    }
    return content;
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-[100] flex items-center gap-2 bg-slate-900 border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 rounded-full px-3 py-2 shadow-xl transition-colors"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span className="text-xs font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>

      {page !== 'login' && page !== 'register' && (
        <Header currentPage={page} onNavigate={navigate} />
      )}
      {page === 'home' && <HomePage onNavigate={navigate} />}
      {page === 'login' && <LoginPage onNavigate={navigate} />}
      {page === 'register' && <RegisterPage onNavigate={navigate} />}
      {page === 'dashboard' && requireAuth(<DashboardPage onNavigate={navigate} />)}
      {page === 'books' && requireAuth(<BooksPage onNavigate={navigate} />)}
      {page === 'admin' && requireAdmin(<AdminPage onNavigate={navigate} />)}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
