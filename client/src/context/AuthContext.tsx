import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '../lib/api';

type Role = 'BUYER' | 'SELLER' | 'ADMIN';

type User = {
  id: string;
  email: string;
  role: Role;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (payload: { email: string; password: string }) => Promise<User>;
  register: (payload: { name: string; email: string; password: string; role: Role }) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeToken(token: string): User | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) {
      return null;
    }

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const payload = JSON.parse(normalized) as { id?: string; email?: string; role?: Role };

    if (!payload.id || !payload.email || !payload.role) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
  } catch (_error) {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('codemarket_token');

    if (storedToken) {
      const decodedUser = decodeToken(storedToken);
      if (decodedUser) {
        setToken(storedToken);
        setUser(decodedUser);
      } else {
        localStorage.removeItem('codemarket_token');
      }
    }

    setLoading(false);
  }, []);

  const saveSession = (nextToken: string) => {
    localStorage.setItem('codemarket_token', nextToken);
    const decodedUser = decodeToken(nextToken);
    if (decodedUser) {
      setToken(nextToken);
      setUser(decodedUser);
      return decodedUser;
    }

    throw new Error('Session token was invalid.');
  };

  const login = async (payload: { email: string; password: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.token) {
      throw new Error(result.message ?? 'Unable to sign in.');
    }

    return saveSession(result.token);
  };

  const register = async (payload: { name: string; email: string; password: string; role: Role }) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.token) {
      throw new Error(result.message ?? 'Unable to create account.');
    }

    return saveSession(result.token);
  };

  const logout = () => {
    localStorage.removeItem('codemarket_token');
    setUser(null);
    setToken(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
