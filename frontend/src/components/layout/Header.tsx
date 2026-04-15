import { useState } from 'react';
import { BookOpen, LogOut, User, Menu, X, LayoutDashboard, Library, Shield, Users, ReceiptText, Crown, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Header({ currentPage, onNavigate }: HeaderProps) {
  const { user, signOut, isSubscribed } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    onNavigate('login');
  };

  const navItems = user
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'profile', label: 'Profile', icon: UserCircle2 },
        { id: 'books', label: 'Library', icon: Library },
        ...(user.role !== 'admin' ? [{ id: 'subscription', label: 'Subscription', icon: Crown }] : []),
        ...(user.role === 'admin'
          ? [
              { id: 'admin', label: 'Admin', icon: Shield },
              { id: 'admin-users', label: 'Users', icon: Users },
              { id: 'admin-transactions', label: 'Transactions', icon: ReceiptText },
            ]
          : []),
      ]
    : [];

  return (
    <header className="bg-slate-900 border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button
            onClick={() => onNavigate(user ? 'dashboard' : 'home')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center group-hover:bg-amber-400 transition-colors">
              <BookOpen size={18} className="text-slate-900" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">PageVault</span>
          </button>

          {user && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === id
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
          )}

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                {isSubscribed && (
                  <span className="text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full">
                    SUBSCRIBED
                  </span>
                )}
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
                    <User size={14} className="text-slate-300" />
                  </div>
                  <span className="text-sm text-slate-300 max-w-[140px] truncate">
                    {user.user_metadata?.full_name || user.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate('login')}
                  className="text-sm text-slate-300 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Sign in
                </button>
                <button
                  onClick={() => onNavigate('register')}
                  className="text-sm font-medium bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2 rounded-lg transition-colors"
                >
                  Get started
                </button>
              </div>
            )}
          </div>

          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-slate-700 bg-slate-900 px-4 py-3 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onNavigate(id); setMenuOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPage === id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
          {user ? (
            <button
              onClick={() => { handleSignOut(); setMenuOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <LogOut size={16} /> Sign out
            </button>
          ) : (
            <>
              <button onClick={() => { onNavigate('login'); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg">Sign in</button>
              <button onClick={() => { onNavigate('register'); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm font-medium text-amber-400 hover:bg-slate-800 rounded-lg">Get started</button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
