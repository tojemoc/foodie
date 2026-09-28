/** Inventory item — mirrors Worker `/items` schema (+ native extensions). */
export interface Item {
  id: string;
  name: string;
  number: string;
  format: string;
  category: string;
  notes: string;
  productName?: string;
  brand?: string;
  expiryDate?: string; // YYYY-MM-DD
  placement?: string;
  color: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  quantity?: number;
  unit?: string;
  imageUri?: string;
  source?: 'barcode' | 'produce' | 'manual';
  lookupSource?: string;
}

/** @deprecated Use Item */
export type Card = Item;

export interface Tombstone {
  id: string;
  deletedAt: string;
}

export interface Session {
  token: string;
  userId: string;
  username: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
  error?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export type ExpiryStatus = 'fresh' | 'expiring-soon' | 'expired' | 'unknown';

function parseIsoLocalMidnight(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Whole-day offset from local calendar "today" to expiry (DST-safe). */
export function daysUntilExpiry(expiryDate?: string, ref: Date = new Date()): number | null {
  if (!expiryDate) return null;
  const exp = parseIsoLocalMidnight(expiryDate);
  if (!exp) return null;
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  return Math.round((expDay.getTime() - today.getTime()) / 86_400_000);
}

export function getExpiryStatus(expiryDate?: string, warnDays = 3): ExpiryStatus {
  const diffDays = daysUntilExpiry(expiryDate);
  if (diffDays === null) return 'unknown';
  if (diffDays < 0) return 'expired';
  if (diffDays <= warnDays) return 'expiring-soon';
  return 'fresh';
}

export const DEFAULT_PLACEMENTS = [
  { id: 'fridge', name: 'Fridge', emoji: '🧊', color: '#3B82F6' },
  { id: 'freezer', name: 'Freezer', emoji: '❄️', color: '#0EA5E9' },
  { id: 'pantry', name: 'Pantry', emoji: '🗄️', color: '#A16207' },
  { id: 'counter', name: 'Counter', emoji: '🍎', color: '#16A34A' },
] as const;
