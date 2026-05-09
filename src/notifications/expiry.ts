import type { Card } from '../types.js';
import { showToast } from '../ui/toast.js';

const LAST_NOTICE_KEY = 'foodie_v2_expiry_notice';

export function notifyExpiring(cards: Card[]): void {
  if (typeof Notification === 'undefined') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const soon = cards
    .filter(c => !!c.expiryDate)
    .map(c => ({ card: c, date: parseIsoDate(c.expiryDate!) }))
    .filter(x => !!x.date)
    .map(x => ({ card: x.card, date: x.date as Date }))
    .filter(x => {
      const days = Math.floor((x.date.getTime() - today.getTime()) / 86_400_000);
      return days >= 0 && days <= 3;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (!soon.length) return;

  const signature = soon.map(s => `${s.card.id}:${s.card.expiryDate}`).join('|');
  const last = localStorage.getItem(LAST_NOTICE_KEY);
  if (last === signature) return;

  const send = () => {
    const first = soon[0]!;
    const firstDays = Math.floor((first.date.getTime() - today.getTime()) / 86_400_000);
    const body =
      firstDays < 0
        ? `${first.card.name} expired ${Math.abs(firstDays)} day(s) ago`
        : firstDays === 0
          ? `${first.card.name} expires today`
          : `${first.card.name} expires in ${firstDays} day(s)`;

    // In-browser notification when the app is open (not server push). iOS may only show these while Foodie is foregrounded.
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

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
