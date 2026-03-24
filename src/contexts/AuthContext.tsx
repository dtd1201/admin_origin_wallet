import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { adminAuthEndpointConfig, requestApi } from "@/lib/api";
import type { AdminAuthChallenge, AdminAuthResponse, AdminUser } from "@/types/admin";

const authStorageKey = "origin_wallet_admin_token";

interface StoredSession {
  token: string;
  user: AdminUser;
}

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  authError: string | null;
  token: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<AdminAuthChallenge>;
  verifyLogin: (email: string, verificationCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const saveSession = (session: StoredSession) => {
  localStorage.setItem(authStorageKey, JSON.stringify(session));
};

const clearStoredSession = () => {
  localStorage.removeItem(authStorageKey);
};

const toStoredSession = (payload: AdminAuthResponse, fallbackToken?: string | null): StoredSession => {
  const token = payload.token ?? fallbackToken;

  if (!payload.user || !token) {
    throw new Error("Admin auth response is missing session data");
  }

  return {
    token,
    user: payload.user,
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const applySession = useCallback((session: StoredSession) => {
    saveSession(session);
    setToken(session.token);
    setUser(session.user);
    setAuthError(null);
  }, []);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUser(null);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const saved = localStorage.getItem(authStorageKey);
    if (!saved) {
      clearSession();
      return;
    }

    const parsed = JSON.parse(saved) as StoredSession;
    const payload = await requestApi<AdminAuthResponse>(adminAuthEndpointConfig.me, {
      method: "GET",
      token: parsed.token,
    });

    applySession(toStoredSession(payload, parsed.token));
  }, [applySession, clearSession]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const saved = localStorage.getItem(authStorageKey);
        if (!saved) {
          return;
        }

        const parsed = JSON.parse(saved) as StoredSession;
        const payload = await requestApi<AdminAuthResponse>(adminAuthEndpointConfig.me, {
          method: "GET",
          token: parsed.token,
        });

        applySession(toStoredSession(payload, parsed.token));
      } catch (error) {
        console.warn("Unable to restore admin session", error);
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    void restoreSession();
  }, [applySession, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const payload = await requestApi<AdminAuthChallenge>(adminAuthEndpointConfig.login, {
        method: "POST",
        body: { email, password },
      });
      setAuthError(null);
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start admin login";
      setAuthError(message);
      throw error;
    }
  }, []);

  const verifyLogin = useCallback(async (email: string, verificationCode: string) => {
    try {
      const payload = await requestApi<AdminAuthResponse>(adminAuthEndpointConfig.loginVerify, {
        method: "POST",
        body: {
          email,
          verification_code: verificationCode,
        },
      });

      applySession(toStoredSession(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify admin login";
      setAuthError(message);
      throw error;
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    const currentToken = token;
    clearSession();

    if (!currentToken) {
      return;
    }

    try {
      await requestApi<{ message: string }>(adminAuthEndpointConfig.logout, {
        method: "POST",
        body: {},
        token: currentToken,
      });
    } catch (error) {
      console.warn("Admin logout request failed", error);
    }
  }, [clearSession, token]);

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      token,
      clearAuthError,
      login,
      verifyLogin,
      logout,
      refreshSession,
    }),
    [authError, clearAuthError, loading, login, logout, refreshSession, token, user, verifyLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
