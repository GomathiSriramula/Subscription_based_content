import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiRequest } from '../lib/api';
import { AppUser, AppSession, Subscription } from '../types';

const AUTH_TOKEN_KEY = 'pagevault_token';

interface AuthApiResponse {
  user: AppUser;
  session: AppSession;
  subscription: Subscription | null;
}

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  subscription: Subscription | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  isSubscribed: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuthResponse = (payload: AuthApiResponse) => {
    setUser(payload.user);
    setSession(payload.session);
    setSubscription(payload.subscription);
    localStorage.setItem(AUTH_TOKEN_KEY, payload.session.access_token);
  };

  const clearAuthState = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setSession(null);
    setSubscription(null);
  };

  useEffect(() => {
    const initialize = async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const payload = await apiRequest<AuthApiResponse>('/api/auth/me', { token });
        applyAuthResponse(payload);
      } catch {
        clearAuthState();
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const payload = await apiRequest<AuthApiResponse>('/api/auth/signup', {
        method: 'POST',
        body: { email, password, fullName },
      });
      applyAuthResponse(payload);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to sign up.' };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const payload = await apiRequest<AuthApiResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      applyAuthResponse(payload);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to sign in.' };
    }
  };

  const signOut = async () => {
    clearAuthState();
  };

  const refreshSubscription = async () => {
    if (!session?.access_token) return;
    try {
      const payload = await apiRequest<{ data: Subscription | null }>('/api/subscription/me', {
        token: session.access_token,
      });
      setSubscription(payload.data);
    } catch {
      setSubscription(null);
    }
  };

  const isSubscribed = subscription !== null && subscription.status === 'active';

  return (
    <AuthContext.Provider value={{ user, session, subscription, loading, signUp, signIn, signOut, refreshSubscription, isSubscribed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
