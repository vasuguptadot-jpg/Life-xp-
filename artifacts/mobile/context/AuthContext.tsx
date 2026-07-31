import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthTokenGetter } from '@workspace/api-client-react';

interface AuthContextType {
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEYS = {
  ACCESS: 'lifexp_access_token',
  REFRESH: 'lifexp_refresh_token',
} as const;

// Register the async token getter once — reads latest value from AsyncStorage
setAuthTokenGetter(async () => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS);
  return token ?? null;
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [at, rt] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.ACCESS),
          AsyncStorage.getItem(STORAGE_KEYS.REFRESH),
        ]);
        setAccessToken(at);
        setRefreshToken(rt);
      } catch {
        // Storage read failed — treat as unauthenticated
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (at: string, rt: string) => {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.ACCESS, at),
      AsyncStorage.setItem(STORAGE_KEYS.REFRESH, rt),
    ]);
    setAccessToken(at);
    setRefreshToken(rt);
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.ACCESS),
      AsyncStorage.removeItem(STORAGE_KEYS.REFRESH),
    ]);
    setAccessToken(null);
    setRefreshToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        refreshToken,
        isAuthenticated: !!accessToken,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
