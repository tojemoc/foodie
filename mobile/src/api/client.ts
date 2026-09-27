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

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) headers.Authorization = `Bearer ${_token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return res.json() as Promise<T>;
}

export const authMagicSend = (email: string) =>
  request<{ ok: boolean; error?: string }>('/auth/magic/send', 'POST', { email });

export const authMagicVerify = (token: string) =>
  request<AuthResponse>('/auth/magic/verify', 'POST', { token });

export const authMe = () =>
  request<{ id: string; username: string; email: string }>('/auth/me', 'GET');

export const fetchItems = () =>
  request<{ items: Item[]; tombstones: Tombstone[]; error?: string }>('/items', 'GET');

export const pushItems = (items: Item[], tombstones: Tombstone[]) =>
  request<{ ok: boolean; error?: string }>('/items', 'POST', { items, tombstones });
