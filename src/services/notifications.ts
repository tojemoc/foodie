import { db } from './db';
import { daysUntilExpiry } from '../types';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

type NotifType = 'none' | 'd3' | 'd1' | 'exp';

function notifTypeForDays(days: number): NotifType | null {
  if (days === 3) return 'd3';
  if (days === 1) return 'd1';
  if (days < 0) return 'exp';
  return null;
}

export async function checkExpiringSoon(): Promise<void> {
  if (Notification.permission !== 'granted') return;

  const items = await db.items.toArray();
  const todayISO = new Date().toISOString().split('T')[0];

  for (const item of items) {
    const days = daysUntilExpiry(new Date(item.expiryDate));
    const type = notifTypeForDays(days);
    if (!type) continue;

    if (item.lastNotified?.type === type && item.lastNotified?.date === todayISO) continue;

    const titles: Record<NotifType, string> = {
      none: '', d3: 'Expiring Soon', d1: 'Expires Tomorrow!', exp: 'Expired!',
    };
    const bodies: Record<NotifType, string> = {
      none: '',
      d3: `${item.name} expires in 3 days`,
      d1: `${item.name} expires tomorrow`,
      exp: `${item.name} has expired`,
    };

    new Notification(titles[type], {
      body: bodies[type],
      icon: '/favicon.svg',
      tag: `expiry-${item.id}-${type}`,
    });

    await db.items.update(item.id!, { lastNotified: { type, date: todayISO } });
  }
}

export function registerPeriodicSync() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    if ('periodicSync' in reg) {
      (reg as unknown as { periodicSync: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } })
        .periodicSync.register('check-expiry', { minInterval: 24 * 60 * 60 * 1000 }).catch(() => {});
    }
  });
}
