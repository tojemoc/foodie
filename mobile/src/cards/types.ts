/** Inventory item — mirrors Worker `/cards` schema (+ native extensions). */
export interface Card {
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
  /** Native extensions (ignored by older PWA clients). */
  quantity?: number;
  unit?: string;
  imageUri?: string;
  source?: 'barcode' | 'produce' | 'manual';
  lookupSource?: string;
}

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

export function getExpiryStatus(expiryDate?: string, warnDays = 3): ExpiryStatus {
  if (!expiryDate) return 'unknown';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return 'unknown';
  const diffDays = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= warnDays) return 'expiring-soon';
  return 'fresh';
}

export function daysUntilExpiry(expiryDate?: string): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
}

export const DEFAULT_PLACEMENTS = [
  { id: 'fridge', name: 'Fridge', emoji: '🧊', color: '#3B82F6' },
  { id: 'freezer', name: 'Freezer', emoji: '❄️', color: '#0EA5E9' },
  { id: 'pantry', name: 'Pantry', emoji: '🗄️', color: '#A16207' },
  { id: 'counter', name: 'Counter', emoji: '🍎', color: '#16A34A' },
] as const;
