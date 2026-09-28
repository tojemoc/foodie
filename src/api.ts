import type { Item, Tombstone, AuthResponse } from './types.js';

// ⚠️  Set this to your deployed Worker URL
export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

let _token: string | null = null;

export function setToken(t: string | null): void {
  _token = t;
}

async function request<T>(
  path:    string,
  method:  string,
  body?:   unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authRegisterBegin  = (email: string)    => request<{ options: PublicKeyCredentialCreationOptionsJSON }>('/auth/register/begin',  'POST', { email });
export const authRegisterFinish = (body: unknown)    => request<AuthResponse>('/auth/register/finish', 'POST', body);
export const authLoginBegin     = ()                  => request<{ options: PublicKeyCredentialRequestOptionsJSON  }>('/auth/login/begin',     'POST', {});
export const authLoginFinish    = (body: unknown)    => request<AuthResponse>('/auth/login/finish',    'POST', body);
export const authMagicSend      = (email: string)    => request<{ ok: boolean; error?: string }>('/auth/magic/send',   'POST', { email });
export const authMagicVerify    = (token: string)    => request<AuthResponse>('/auth/magic/verify', 'POST', { token });
export const authMe             = ()                  => request<{ id: string; username: string; email: string }>('/auth/me', 'GET');

// ── Items ─────────────────────────────────────────────────────────────────────

export const fetchItems = ()                                        => request<{ items: Item[]; tombstones: Tombstone[]; error?: string }>('/items', 'GET');
export const pushItems  = (items: Item[], tombstones: Tombstone[]) => request<{ ok: boolean; error?: string }>('/items', 'POST', { items, tombstones });

// ── Web Push ──────────────────────────────────────────────────────────────────

export const fetchVapidPublicKey = () =>
  request<{ publicKey?: string; error?: string }>('/push/vapid-public-key', 'GET');

export const registerPushSubscription = (body: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) => request<{ ok?: boolean; error?: string }>('/push/subscribe', 'POST', body);

export interface UserPrefs {
  emailDigest: boolean;
  timezone: string;
  updatedAt?: string;
}

export const fetchPrefs = () =>
  request<UserPrefs & { error?: string }>('/prefs', 'GET');

export const updatePrefs = (body: { emailDigest?: boolean; timezone?: string }) =>
  request<UserPrefs & { error?: string }>('/prefs', 'PUT', body);

// ── WebAuthn JSON types (not yet in all TS libs) ──────────────────────────────
// These mirror the browser API shapes but as plain JSON (serialised over the wire).

export interface PublicKeyCredentialCreationOptionsJSON {
  challenge:              string;
  rp:                     { name: string; id: string };
  user:                   { id: string; name: string; displayName: string };
  pubKeyCredParams:       { alg: number; type: string }[];
  authenticatorSelection: Record<string, unknown>;
  timeout:                number;
  attestation:            string;
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge:        string;
  rpId:             string;
  timeout:          number;
  userVerification: string;
  allowCredentials: unknown[];
}
