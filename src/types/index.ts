export interface FoodItem {
  id?: number;
  name: string;
  ean?: string;
  expiryDate: Date;
  locationId: number;
  imageUrl?: string;
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

export function getExpiryStatus(expiryDate: Date): ExpiryStatus {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'expiring-soon';
  return 'fresh';
}

export function daysUntilExpiry(expiryDate: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
