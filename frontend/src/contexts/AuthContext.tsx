import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { apiRequest, ApiError } from '../lib/api';
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
  updateProfile: (fullName: string, email: string) => Promise<{ error: string | null }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  isSubscribed: boolean;
}

interface JwtPayload {
  exp?: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      return null;
    }

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const expiryTimerRef = useRef<number | null>(null);

  const clearExpiryTimer = () => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  };

  const clearAuthState = () => {
    clearExpiryTimer();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setSession(null);
    setSubscription(null);
  };

  const scheduleSessionExpiry = (token: string) => {
    clearExpiryTimer();

    const payload = decodeJwtPayload(token);
    if (!payload?.exp) {
      return;
    }

    const expiresInMs = payload.exp * 1000 - Date.now();
    if (expiresInMs <= 0) {
      clearAuthState();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearAuthState();
    }, expiresInMs);

    expiryTimerRef.current = timeoutId;
  };

  const applyAuthResponse = (payload: AuthApiResponse) => {
    setUser(payload.user);
    setSession(payload.session);
    setSubscription(payload.subscription);
    localStorage.setItem(AUTH_TOKEN_KEY, payload.session.access_token);
    scheduleSessionExpiry(payload.session.access_token);
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
      } catch (error) {
        clearAuthState();
      } finally {
        setLoading(false);
      }
    };

    const handleSessionExpired = () => {
      clearAuthState();
    };

    window.addEventListener('pagevault:session-expired', handleSessionExpired as EventListener);

    initialize();

    return () => {
      window.removeEventListener('pagevault:session-expired', handleSessionExpired as EventListener);
      clearExpiryTimer();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      clearExpiryTimer();
      return;
    }

    scheduleSessionExpiry(session.access_token);
    return () => {
      clearExpiryTimer();
    };
  }, [session?.access_token]);

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

  const updateProfile = async (fullName: string, email: string) => {
    if (!session?.access_token) {
      return { error: 'Please sign in again to continue.' };
    }

    try {
      const payload = await apiRequest<AuthApiResponse>('/api/auth/me', {
        method: 'PUT',
        token: session.access_token,
        body: { fullName, email },
      });
      applyAuthResponse(payload);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to update profile.' };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!session?.access_token) {
      return { error: 'Please sign in again to continue.' };
    }

    try {
      await apiRequest<{ message: string }>('/api/auth/password', {
        method: 'PUT',
        token: session.access_token,
        body: { currentPassword, newPassword },
      });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to change password.' };
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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAuthState();
        return;
      }
      clearAuthState();
      setSubscription(null);
    }
  };

  const isSubscribed = subscription !== null && subscription.status === 'active';

  return (
    <AuthContext.Provider value={{ user, session, subscription, loading, signUp, signIn, updateProfile, changePassword, signOut, refreshSubscription, isSubscribed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
