export interface FoodItem {
  id?: number;
  name: string;
  ean?: string;
  expiryDate: Date;
  locationId: number;
  imageUrl?: string;
  lastNotified?: { type: 'none' | 'd3' | 'd1' | 'exp'; date: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface Location {
  id?: number;
  name: string;
  icon: string;
}

export interface DateExtractionResult {
  date: Date;
  confidence: number;
  rawText: string;
  pattern: string;
}

export interface ScanResult {
  type: 'barcode' | 'ocr';
  value: string;
  raw?: string;
}

export interface ProductInfo {
  name: string;
  imageUrl?: string;
  brand?: string;
}

export type ExpiryStatus = 'fresh' | 'expiring-soon' | 'expired';

function utcDays(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getExpiryStatus(expiryDate: Date): ExpiryStatus {
  const diffDays = Math.floor((utcDays(new Date(expiryDate)) - utcDays(new Date())) / 86_400_000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'expiring-soon';
  return 'fresh';
}

export function daysUntilExpiry(expiryDate: Date): number {
  return Math.floor((utcDays(new Date(expiryDate)) - utcDays(new Date())) / 86_400_000);
}
