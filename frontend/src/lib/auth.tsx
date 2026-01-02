'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api-client';
import { clearTokens, loadTokens, saveTokens } from './auth-storage';
import { AuthTokens, User } from './types';

interface AuthContextValue {
  user: User | null;
  tokens: AuthTokens | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadTokens();
    if (stored) {
      setTokens(stored);
      void fetchMe(stored, setUser, () => setTokens(null));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await apiFetch<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      // The API returns { ok, data: { user, accessToken, ... } }
      // The apiFetch function returns the whole body, so we need to grab the inner data.
      const responseData = response.data.data;
      const newTokens: AuthTokens = {
        accessToken: responseData.accessToken,
        expiresIn: responseData.expiresIn
      };

      saveTokens(newTokens);
      setTokens(newTokens);
      await fetchMe(newTokens, setUser, () => setTokens(null));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!tokens) return;
    await fetchMe(tokens, setUser, () => setTokens(null));
  }, [tokens]);

  const logout = useCallback(() => {
    clearTokens();
    setTokens(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, tokens, loading, login, logout, refreshProfile }),
    [user, tokens, loading, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

async function fetchMe(tokens: AuthTokens, setUser: (u: User | null) => void, onUnauthorized: () => void) {
  try {
    const { data } = await apiFetch<any>('/api/me');
    const payload = data?.data ?? data;
    setUser(payload as User);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      onUnauthorized();
      clearTokens();
      setUser(null);
    }
  }
}
