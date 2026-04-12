import { db } from './db';
import { daysUntilExpiry } from '../types';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function checkExpiringSoon(): Promise<void> {
  const permitted = Notification.permission === 'granted';
  if (!permitted) return;

  const items = await db.items.toArray();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const item of items) {
    const days = daysUntilExpiry(new Date(item.expiryDate));
    if (days === 3) {
      new Notification('Expiring Soon', {
        body: `${item.name} expires in 3 days`,
        icon: '/favicon.svg',
        tag: `expiry-${item.id}-3`,
      });
    } else if (days === 1) {
      new Notification('Expires Tomorrow!', {
        body: `${item.name} expires tomorrow`,
        icon: '/favicon.svg',
        tag: `expiry-${item.id}-1`,
      });
    } else if (days < 0) {
      new Notification('Expired!', {
        body: `${item.name} has expired`,
        icon: '/favicon.svg',
        tag: `expiry-${item.id}-exp`,
      });
    }
  }
}
