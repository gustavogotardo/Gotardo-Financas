'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, getTokens, setTokens, type AuthTokens, type MeResponse } from './api';

type RegisterPayload = {
  name: string;
  familyName: string;
  email: string;
  password: string;
};

type AuthState = {
  user: MeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  acceptInvitation: (token: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const applyTokens = useCallback((tokens: AuthTokens | null) => {
    setTokens(tokens);
    if (!tokens) setUser(null);
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        if (getTokens()) {
          const me = await apiFetch<MeResponse>('/api/v1/auth/me');
          if (active) setUser(me);
        }
      } catch {
        setTokens(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    const onSessionExpired = () => setUser(null);
    window.addEventListener('gotardo:session-expired', onSessionExpired);
    return () => {
      active = false;
      window.removeEventListener('gotardo:session-expired', onSessionExpired);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiFetch<AuthTokens>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      applyTokens(tokens);
      const me = await apiFetch<MeResponse>('/api/v1/auth/me');
      setUser(me);
    },
    [applyTokens],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const tokens = await apiFetch<AuthTokens>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      applyTokens(tokens);
      const me = await apiFetch<MeResponse>('/api/v1/auth/me');
      setUser(me);
    },
    [applyTokens],
  );

  const acceptInvitation = useCallback(
    async (token: string, name: string, password: string) => {
      const tokens = await apiFetch<AuthTokens>('/api/v1/auth/accept-invitation', {
        method: 'POST',
        body: JSON.stringify({ token, name, password }),
      });
      applyTokens(tokens);
      const me = await apiFetch<MeResponse>('/api/v1/auth/me');
      setUser(me);
    },
    [applyTokens],
  );

  const logout = useCallback(async () => {
    const current = getTokens();
    if (current?.refreshToken) {
      try {
        await apiFetch<void>('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
      } catch {
        // ignora falha no logout
      }
    }
    applyTokens(null);
  }, [applyTokens]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, acceptInvitation, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
