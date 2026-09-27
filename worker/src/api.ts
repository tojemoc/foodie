import type { Item, AuthResponse } from './types.js';

export const API_BASE = 'http://localhost:8787';

let _token: string | null = null;

export function setToken(t: string | null): void {
  _token = t;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}

export const authRegisterBegin  = (email: string) => request<{ options: unknown }>('/auth/register/begin',  'POST', { email });
export const authRegisterFinish = (body: unknown) => request<AuthResponse>('/auth/register/finish', 'POST', body);
export const authLoginBegin     = ()              => request<{ options: unknown }>('/auth/login/begin',     'POST', {});
export const authLoginFinish    = (body: unknown) => request<AuthResponse>('/auth/login/finish',    'POST', body);

export const fetchItems = ()               => request<{ items: Item[]; error?: string }>('/items', 'GET');
export const pushItems  = (items: Item[])  => request<{ ok: boolean; error?: string }>('/items', 'POST', { items });
