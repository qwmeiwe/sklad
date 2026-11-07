import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCurrentUser, login as requestLogin } from "../api";
import type { User, UserRole } from "../types";

const TOKEN_KEY = "smart-logistics-token";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, expectedRole: UserRole) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    window.localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setUser(null);
      return;
    }

    let active = true;
    setLoading(true);
    getCurrentUser(token)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const authenticate = useCallback(
    async (username: string, password: string, expectedRole: UserRole) => {
      const newToken = await requestLogin(username, password);
      const currentUser = await getCurrentUser(newToken);
      if (currentUser.role !== expectedRole) {
        throw new Error("Выбранная роль не совпадает с ролью этой учётной записи.");
      }
      window.localStorage.setItem(TOKEN_KEY, newToken);
      setUser(currentUser);
      setToken(newToken);
    },
    [],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, loading, login: authenticate, logout }),
    [token, user, loading, authenticate, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
