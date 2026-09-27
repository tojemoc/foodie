import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authMagicSend, authMagicVerify, authMe, setToken } from '../api/client';
import type { Session } from '../cards/types';
import { loadFromStorage } from '../cards/store';
import { syncOnOpen } from '../cards/sync';

const SESSION_KEY = 'foodie_session_v3';

interface AuthContextValue {
  session: Session | null;
  ready: boolean;
  sendMagicLink: (email: string) => Promise<{ ok: boolean; error?: string }>;
  verifyMagicToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  continueOffline: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function writeSession(session: Session | null): Promise<void> {
  if (!session) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadFromStorage();
      const stored = await readSession();
      if (cancelled) return;
      if (stored?.token) {
        setToken(stored.token);
        try {
          await authMe();
          setSession(stored);
          void syncOnOpen();
        } catch {
          setToken(null);
          await writeSession(null);
          setSession(null);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    return authMagicSend(email.trim().toLowerCase());
  }, []);

  const verifyMagicToken = useCallback(async (token: string) => {
    const res = await authMagicVerify(token);
    if (res.error || !res.token) {
      return { ok: false, error: res.error ?? 'Invalid or expired link' };
    }
    const next: Session = {
      token: res.token,
      userId: res.userId,
      username: res.username,
    };
    setToken(next.token);
    await writeSession(next);
    setSession(next);
    void syncOnOpen();
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    await writeSession(null);
    setSession(null);
  }, []);

  const continueOffline = useCallback(() => {
    setSession(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      ready,
      sendMagicLink,
      verifyMagicToken,
      signOut,
      continueOffline,
    }),
    [session, ready, sendMagicLink, verifyMagicToken, signOut, continueOffline],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
