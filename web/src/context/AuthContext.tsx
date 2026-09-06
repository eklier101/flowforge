import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@flowforge/api-client";

import { api, setAuthToken } from "../api";

type AuthContextValue = {
  user: AuthUser;
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ user: initialUser, children }: { user: AuthUser; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(initialUser);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* still clear local session */
    }
    setAuthToken(null);
    window.location.reload();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, setUser, logout }),
    [user, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
