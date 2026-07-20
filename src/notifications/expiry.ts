import type { Card } from '../types.js';
import { showToast } from '../ui/toast.js';

const LAST_NOTICE_KEY = 'foodie_v2_expiry_notice';

export function notifyExpiring(cards: Card[]): void {
  if (typeof Notification === 'undefined') return;

  const now = new Date();

  const soon = cards
    .filter(c => !!c.expiryDate)
    .map(c => ({ card: c, days: calendarDaysUntilExpiry(c.expiryDate!, now) }))
    .filter(x => x.days !== null)
    .map(x => ({ card: x.card, days: x.days as number }))
    .filter(x => x.days >= -1 && x.days <= 3)
    .sort((a, b) => {
      const da = parseIsoLocalMidnight(a.card.expiryDate!)!.getTime();
      const db = parseIsoLocalMidnight(b.card.expiryDate!)!.getTime();
      return da - db;
    });

  if (!soon.length) return;

  const dayBucket = todayLocalIso(now);
  const signature = `${dayBucket}|${soon.map(s => `${s.card.id}:${s.card.expiryDate}`).join('|')}`;
  const last = localStorage.getItem(LAST_NOTICE_KEY);
  if (last === signature) return;

  const send = () => {
    const first = soon[0]!;
    const firstDays = first.days;
    const name = first.card.productName || first.card.name;
    const body =
      firstDays < 0
        ? `${name} expired ${Math.abs(firstDays)} day(s) ago`
        : firstDays === 0
          ? `${name} expires today`
          : `${name} expires in ${firstDays} day(s)`;

    // In-browser notification when the app is open. Background delivery uses Web Push (see notifications/push.ts + Worker cron).
    new Notification('Foodie — expiry reminder', {
      body,
      tag:  'foodie-expiry',
      lang: 'en',
    });
    localStorage.setItem(LAST_NOTICE_KEY, signature);
    showToast('Expiry reminder shown');
  };

  if (Notification.permission === 'granted') {
    send();
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission()
      .then(p => {
        if (p === 'granted') send();
      })
      .catch(() => {});
  }
}

function todayLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIsoLocalMidnight(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Whole-day offset from local calendar "today" to expiry (avoids DST ms pitfalls). */
function calendarDaysUntilExpiry(iso: string, ref: Date): number | null {
  const exp = parseIsoLocalMidnight(iso);
  if (!exp) return null;
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  return Math.round((expDay.getTime() - today.getTime()) / 86_400_000);
}
