import type { AuthResponse, Item, Tombstone } from '../items/types';

export const API_BASE = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'
).replace(/\/$/, '');

let _token: string | null = null;

export function setToken(t: string | null): void {
  _token = t;
}

export function getToken(): string | null {
  return _token;
}

/** Always resolves. Network failures use status 0; HTTP errors set `error` + `status`. */
async function request<T extends object>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T & { error?: string; status?: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) headers.Authorization = `Bearer ${_token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data: Record<string, unknown> = {};
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { error: text.slice(0, 200) || res.statusText || `HTTP ${res.status}` };
      }
    }

    if (!res.ok) {
      const message =
        (typeof data.error === 'string' && data.error) ||
        res.statusText ||
        `HTTP ${res.status}`;
      return { ...(data as T), error: message, status: res.status };
    }

    return data as T & { error?: string; status?: number };
  } catch {
    return { error: 'Network error', status: 0 } as T & { error?: string; status?: number };
  }
}

export const authMagicSend = (email: string) =>
  request<{ ok: boolean }>('/auth/magic/send', 'POST', { email });

export const authMagicVerify = (token: string) =>
  request<AuthResponse>('/auth/magic/verify', 'POST', { token });

export const authMe = () =>
  request<{ id: string; username: string; email: string }>('/auth/me', 'GET');

export interface UserPrefs {
  emailDigest: boolean;
  timezone: string;
  lastDigestLocalDate?: string;
  updatedAt?: string;
}

export const fetchPrefs = () =>
  request<UserPrefs>('/prefs', 'GET');

export const updatePrefs = (body: { emailDigest?: boolean; timezone?: string }) =>
  request<UserPrefs>('/prefs', 'PUT', body);

export const fetchItems = () =>
  request<{ items: Item[]; tombstones: Tombstone[] }>('/items', 'GET');

export const pushItems = (items: Item[], tombstones: Tombstone[]) =>
  request<{ ok: boolean }>('/items', 'POST', { items, tombstones });
