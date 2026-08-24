import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authService from '../services/auth.service';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [isInitializing, setIsInitializing] = useState(true);

  const persistSession = useCallback(({ user: nextUser, tokens }) => {
    setUser(nextUser);
    setAccessToken(tokens.accessToken);
    localStorage.setItem(TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  // On startup, if a stored session exists, validate it against /me.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const storedToken = localStorage.getItem(TOKEN_KEY);

      if (!storedToken) {
        if (!cancelled) setIsInitializing(false);
        return;
      }

      try {
        const { user: currentUser } = await authService.getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
          setAccessToken(storedToken);
        }
      } catch {
        // Stored session is invalid/expired — clear it. Never fall back to a guest session.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (credentials) => {
      const data = await authService.login(credentials);
      persistSession(data);
      return data;
    },
    [persistSession]
  );

  const register = useCallback(
    async (credentials) => {
      // Registration does not return tokens — email must be verified first
      const data = await authService.register(credentials);
      return data;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Best-effort server-side logout; always clear the local session.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const { user: currentUser } = await authService.getCurrentUser();
    setUser(currentUser);
  }, []);

  // Called after successful email verification — the backend returns tokens
  const persistVerificationSession = useCallback(
    (authData) => {
      persistSession(authData);
    },
    [persistSession]
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user),
      isInitializing,
      login,
      register,
      logout,
      refreshUser,
      persistVerificationSession,
    }),
    [user, accessToken, isInitializing, login, register, logout, refreshUser, persistVerificationSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}