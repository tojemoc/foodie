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
import type { Session } from '../items/types';
import { loadFromStorage, selectStorageNamespace } from '../items/store';
import { syncOnOpen } from '../items/sync';

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

function isAuthFailure(status?: number): boolean {
  return status === 401 || status === 403;
}

function isRetryableServerError(status?: number): boolean {
  return typeof status === 'number' && status >= 500 && status <= 599;
}

async function useAnonymousInventory(): Promise<void> {
  await selectStorageNamespace({ kind: 'anonymous' });
  await loadFromStorage();
}

async function useAccountInventory(userId: string): Promise<void> {
  await selectStorageNamespace({ kind: 'account', userId });
  await loadFromStorage();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await readSession();
      if (cancelled) return;

      if (stored?.token && stored.userId) {
        // Restore the saved account namespace before any sync attempt.
        await useAccountInventory(stored.userId);
        if (cancelled) return;
        setToken(stored.token);
        const me = await authMe();
        if (cancelled) return;

        if (me.status === 0 || isRetryableServerError(me.status)) {
          // Unreachable API or transient 5xx — keep token + account inventory.
          setSession(stored);
        } else if (isAuthFailure(me.status) || (!me.id && me.error)) {
          setToken(null);
          await writeSession(null);
          setSession(null);
          await useAnonymousInventory();
        } else if (me.id) {
          setSession(stored);
          void syncOnOpen();
        } else {
          // Unexpected error shape — keep session like retryable failures.
          setSession(stored);
        }
      } else {
        await useAnonymousInventory();
      }
      if (!cancelled) setReady(true);
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
    if (res.error || !res.token || !res.userId) {
      return { ok: false, error: res.error ?? 'Invalid or expired link' };
    }
    const next: Session = {
      token: res.token,
      userId: res.userId,
      username: res.username,
    };
    setToken(next.token);
    await writeSession(next);
    // Switch to the verified account namespace before sync — leave anon untouched.
    await useAccountInventory(next.userId);
    setSession(next);
    void syncOnOpen();
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    await writeSession(null);
    setSession(null);
    await useAnonymousInventory();
  }, []);

  const continueOffline = useCallback(() => {
    setSession(null);
    setToken(null);
    void useAnonymousInventory();
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
