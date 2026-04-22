import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { exportDbSnapshot, importDbSnapshot } from './db';
import type { FoodItem, Location } from '../types';

export type AuthUser = {
  id: string;
  email: string;
  passkeyCount: number;
};

type SyncSnapshot = {
  items: FoodItem[];
  locations: Location[];
  clientUpdatedAt?: string;
  updatedAt: string;
};

type ApiError = { error?: string };

type StartMagicLinkResponse = {
  ok: boolean;
  delivered: boolean;
  expiresInSeconds: number;
  magicLink?: string;
};

type PasskeyOptionsResponse = {
  ok: boolean;
  options: Record<string, unknown> & { challenge: string };
};

const DEV_FALLBACK_API_BASE = 'http://localhost:8787';

function normalizeBase(url: string): string {
  return url.replace(/\/$/, '');
}

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return normalizeBase(configured);

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return DEV_FALLBACK_API_BASE;
  }
  return normalizeBase(window.location.origin);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });

  const json = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json;
}

function serializeItems(items: FoodItem[]): unknown[] {
  return items.map((item) => ({
    ...item,
    expiryDate: new Date(item.expiryDate).toISOString(),
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  }));
}

function deserializeItems(items: unknown[]): FoodItem[] {
  return items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'number' ? item.id : undefined,
      name: String(item.name ?? ''),
      ean: item.ean ? String(item.ean) : undefined,
      expiryDate: new Date(String(item.expiryDate ?? new Date().toISOString())),
      locationId: Number(item.locationId),
      imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
      lastNotified: item.lastNotified && typeof item.lastNotified === 'object'
        ? {
            type: (item.lastNotified as { type?: 'none' | 'd3' | 'd1' | 'exp' }).type ?? 'none',
            date: String((item.lastNotified as { date?: string }).date ?? ''),
          }
        : undefined,
      createdAt: new Date(String(item.createdAt ?? new Date().toISOString())),
      updatedAt: new Date(String(item.updatedAt ?? new Date().toISOString())),
    }))
    .filter((item) => item.name && Number.isFinite(item.locationId));
}

function deserializeLocations(locations: unknown[]): Location[] {
  return locations
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'number' ? item.id : undefined,
      name: String(item.name ?? ''),
      icon: String(item.icon ?? '📦'),
    }))
    .filter((loc) => loc.name);
}

export async function getCurrentUser(): Promise<ApiUser | null> {
  try {
    const res = await api<{ ok: boolean; user: ApiUser }>('/auth/me', { method: 'GET' });
    return res.user;
  } catch {
    return null;
  }
}

export function isCloudSyncConfigured(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE_URL?.trim());
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  return getCurrentUser();
}

export async function startMagicLinkSignIn(email: string): Promise<StartMagicLinkResponse> {
  return startMagicLinkLogin(email);
}

export async function startMagicLinkLogin(email: string): Promise<StartMagicLinkResponse> {
  return api<StartMagicLinkResponse>('/auth/magic-link/start', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyMagicLinkToken(token: string): Promise<ApiUser> {
  const res = await api<{ ok: boolean; user: ApiUser }>('/auth/magic-link/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.user;
}

export async function registerPasskey(): Promise<number> {
  if (!window.PublicKeyCredential) {
    throw new Error('Passkeys are not supported in this browser');
  }
  const options = await api<PasskeyOptionsResponse>('/auth/passkey/register/options', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const response = await startRegistration({ optionsJSON: options.options });
  const verify = await api<{ ok: boolean; passkeyCount: number }>('/auth/passkey/register/verify', {
    method: 'POST',
    body: JSON.stringify({ response }),
  });
  return verify.passkeyCount;
}

export async function signInWithPasskey(email?: string): Promise<ApiUser> {
  if (!window.PublicKeyCredential) {
    throw new Error('Passkeys are not supported in this browser');
  }
  const options = await api<PasskeyOptionsResponse>('/auth/passkey/authenticate/options', {
    method: 'POST',
    body: JSON.stringify(email ? { email } : {}),
  });
  const response = await startAuthentication({ optionsJSON: options.options });
  const verify = await api<{ ok: boolean; user: ApiUser }>('/auth/passkey/authenticate/verify', {
    method: 'POST',
    body: JSON.stringify({
      challenge: options.options.challenge,
      response,
    }),
  });
  return verify.user;
}

export async function logoutCloudSession(): Promise<void> {
  await api<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function logoutAuthSession(): Promise<void> {
  await logoutCloudSession();
}

export async function pushLocalDataToCloud(): Promise<string> {
  const { items, locations } = await exportDbSnapshot();
  const res = await api<{ ok: boolean; updatedAt: string }>('/sync', {
    method: 'PUT',
    body: JSON.stringify({
      items: serializeItems(items),
      locations,
      clientUpdatedAt: new Date().toISOString(),
    }),
  });
  return res.updatedAt;
}

export async function pushLocalSnapshotToCloud(): Promise<{ updatedAt: string; itemCount: number; locationCount: number }> {
  const { items, locations } = await exportDbSnapshot();
  const updatedAt = await pushLocalDataToCloud();
  return {
    updatedAt,
    itemCount: items.length,
    locationCount: locations.length,
  };
}

export async function pullCloudDataToLocal(): Promise<string | null> {
  const res = await api<{ ok: boolean; snapshot: SyncSnapshot | null }>('/sync', {
    method: 'GET',
  });
  if (!res.snapshot) return null;

  const items = deserializeItems((res.snapshot.items as unknown[]) ?? []);
  const locations = deserializeLocations((res.snapshot.locations as unknown[]) ?? []);

  await importDbSnapshot({ items, locations });

  return res.snapshot.updatedAt;
}

export async function pullCloudSnapshotToLocal(): Promise<{ updatedAt: string; itemCount: number; locationCount: number } | null> {
  const res = await api<{ ok: boolean; snapshot: SyncSnapshot | null }>('/sync', {
    method: 'GET',
  });
  if (!res.snapshot) return null;
  const items = deserializeItems((res.snapshot.items as unknown[]) ?? []);
  const locations = deserializeLocations((res.snapshot.locations as unknown[]) ?? []);
  await importDbSnapshot({ items, locations });
  return {
    updatedAt: res.snapshot.updatedAt,
    itemCount: items.length,
    locationCount: locations.length,
  };
}
