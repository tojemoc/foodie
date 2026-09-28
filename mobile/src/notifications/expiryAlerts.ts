import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getItems } from '../items/store';
import { daysUntilExpiry } from '../items/types';

const DAILY_DIGEST_ID = 'foodie-daily-expiry-digest';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return !!asked.granted;
}

/** Schedule a repeating local notification around 08:00 listing items expiring within 7 days. */
export async function registerDailyExpiryDigest(): Promise<{ ok: boolean; error?: string }> {
  const granted = await ensureNotificationPermissions();
  if (!granted) {
    return { ok: false, error: 'Notification permission denied' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('expiry', {
      name: 'Expiry reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelScheduledNotificationAsync(DAILY_DIGEST_ID).catch(() => {});

  const body = buildDigestBody();
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_DIGEST_ID,
    content: {
      title: 'Foodie — expiring this week',
      body: body || 'Open Foodie to review items expiring in the next 7 days.',
      data: { type: 'expiry-digest' },
      ...(Platform.OS === 'android' ? { channelId: 'expiry' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
    },
  });

  return { ok: true };
}

export async function unregisterDailyExpiryDigest(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_DIGEST_ID).catch(() => {});
}

export async function isDailyExpiryDigestScheduled(): Promise<boolean> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.some(n => n.identifier === DAILY_DIGEST_ID);
}

/** Immediate local notification for items expiring within 3 days (on open / after enable). */
export async function notifyExpiringSoonNow(): Promise<void> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const soon = getItems()
    .map(item => ({ item, days: daysUntilExpiry(item.expiryDate) }))
    .filter((x): x is { item: (typeof x)['item']; days: number } => x.days != null && x.days >= 0 && x.days <= 3)
    .sort((a, b) => a.days - b.days);

  if (!soon.length) return;

  const first = soon[0]!;
  const name = first.item.productName || first.item.name;
  const more = soon.length > 1 ? ` (+${soon.length - 1} more)` : '';
  const when =
    first.days === 0 ? 'expires today' : `expires in ${first.days} day(s)`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Foodie — expiry reminder',
      body: `${name} ${when}${more}`,
      data: { type: 'expiry-soon' },
    },
    trigger: null,
  });
}

function buildDigestBody(): string {
  const week = getItems()
    .map(item => ({ item, days: daysUntilExpiry(item.expiryDate) }))
    .filter((x): x is { item: (typeof x)['item']; days: number } => x.days != null && x.days >= 0 && x.days <= 6)
    .sort((a, b) => a.days - b.days);

  if (!week.length) return '';
  const first = week[0]!;
  const name = first.item.productName || first.item.name;
  const more = week.length > 1 ? ` (+${week.length - 1} more)` : '';
  return `${name} · ${first.item.expiryDate ?? ''}${more}`;
}
