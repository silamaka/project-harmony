import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TOKEN_KEY } from "@/lib/api";
import { users } from "@/lib/mock-data";
import type { Role, User } from "@/types";

const USER_KEY = "beba.user";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Connexion. Branchement API : POST /api/v1/auth/login/ → { access, refresh, user } */
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  /** Mise à jour du profil courant. Branchement API : PATCH /api/v1/auth/me/ */
  updateProfile: (patch: Partial<User>) => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      if (raw) setUser(JSON.parse(raw) as User);
    } catch {
      /* stockage indisponible */
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const found = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || password.length < 4) {
      throw new Error("Identifiants invalides.");
    }
    window.localStorage.setItem(USER_KEY, JSON.stringify(found));
    window.localStorage.setItem(TOKEN_KEY, `demo.${found.id}.jwt`);
    setUser(found);
    return found;
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      hasRole: (...roles: Role[]) => !!user && roles.includes(user.role),
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>.");
  return ctx;
}
