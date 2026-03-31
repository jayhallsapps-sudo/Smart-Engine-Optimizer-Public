import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import type { SafeUser, ModuleKey, ReportSubKey } from "@shared/schema";

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  requiresPasswordChange: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ requiresPasswordChange: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasModule: (module: ModuleKey) => boolean;
  hasReportSubKey: (key: ReportSubKey) => boolean;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, requiresPasswordChange: false });
  const [, navigate] = useLocation();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setState({ user: data.user, loading: false, requiresPasswordChange: data.requiresPasswordChange });
      } else {
        setState({ user: null, loading: false, requiresPasswordChange: false });
      }
    } catch {
      setState({ user: null, loading: false, requiresPasswordChange: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? "Login failed.");
    }
    const data = await res.json();
    setState({ user: data.user, loading: false, requiresPasswordChange: data.requiresPasswordChange });
    return { requiresPasswordChange: data.requiresPasswordChange };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setState({ user: null, loading: false, requiresPasswordChange: false });
    navigate("/login");
  }, [navigate]);

  const hasModule = useCallback(
    (module: ModuleKey): boolean => {
      if (!state.user) return false;
      if (state.user.role === "admin") return true;
      return state.user.modules.includes(module);
    },
    [state.user],
  );

  const hasReportSubKey = useCallback(
    (key: ReportSubKey): boolean => {
      if (!state.user) return false;
      if (state.user.role === "admin") return true;
      return state.user.reportSubKeys.includes(key);
    },
    [state.user],
  );

  const isAdmin = useCallback(() => state.user?.role === "admin", [state.user]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refresh, hasModule, hasReportSubKey, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
