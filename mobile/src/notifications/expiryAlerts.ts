import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getItems } from '../items/store';
import { daysUntilExpiry } from '../items/types';

const DAILY_DIGEST_ID = 'foodie-daily-expiry-digest';
/** Schedule several mornings ahead so reminders keep firing between app opens. */
const DIGEST_ROLLING_DAYS = 7;
const DAILY_DIGEST_ENABLED_KEY = 'foodie_daily_digest_enabled_v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidExpiryChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('expiry', {
    name: 'Expiry reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  // Android 13+ needs the channel before the runtime permission prompt.
  await ensureAndroidExpiryChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return !!asked.granted;
}

function nextLocalEightAm(from = new Date()): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(8, 0, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function digestIdentifier(offset: number): string {
  return offset === 0 ? DAILY_DIGEST_ID : `${DAILY_DIGEST_ID}-${offset}`;
}

async function cancelRollingDigests(): Promise<void> {
  await Promise.all(
    Array.from({ length: DIGEST_ROLLING_DAYS }, (_, i) =>
      Notifications.cancelScheduledNotificationAsync(digestIdentifier(i)),
    ),
  );
}

async function scheduleNextDigest(): Promise<void> {
  await cancelRollingDigests();

  const body = buildDigestBody();
  const content = {
    title: 'Foodie — expiring this week',
    body: body || 'Open Foodie to review items expiring in the next 7 days.',
    data: { type: 'expiry-digest' },
  };

  let at = nextLocalEightAm();
  for (let i = 0; i < DIGEST_ROLLING_DAYS; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: digestIdentifier(i),
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        ...(Platform.OS === 'android' ? { channelId: 'expiry' } : {}),
      },
    });
    at = new Date(at);
    at.setDate(at.getDate() + 1);
  }
}

/** Schedule / refresh the next 08:00 local digest with freshly calculated content. */
export async function registerDailyExpiryDigest(): Promise<{ ok: boolean; error?: string }> {
  const granted = await ensureNotificationPermissions();
  if (!granted) {
    return { ok: false, error: 'Notification permission denied' };
  }

  try {
    // Schedule first so a failure does not leave reminders marked enabled.
    await scheduleNextDigest();
    await AsyncStorage.setItem(DAILY_DIGEST_ENABLED_KEY, '1');
    return { ok: true };
  } catch (err) {
    // Drop only the digests from this attempt; leave unrelated pending notifications.
    try {
      await cancelRollingDigests();
    } catch {
      // best-effort cleanup
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not schedule daily reminder',
    };
  }
}

/** Recompute body and reschedule the next 08:00 alert when inventory or the day changes. */
export async function refreshDailyExpiryDigest(): Promise<void> {
  const enabled = await AsyncStorage.getItem(DAILY_DIGEST_ENABLED_KEY);
  if (enabled !== '1') return;
  const granted = await ensureNotificationPermissions();
  if (!granted) return;
  await scheduleNextDigest();
}

export async function unregisterDailyExpiryDigest(): Promise<void> {
  await cancelRollingDigests();
  await AsyncStorage.removeItem(DAILY_DIGEST_ENABLED_KEY);
}

export async function isDailyExpiryDigestScheduled(): Promise<boolean> {
  const enabled = await AsyncStorage.getItem(DAILY_DIGEST_ENABLED_KEY);
  if (enabled === '1') return true;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.some(n => n.identifier === DAILY_DIGEST_ID || n.identifier.startsWith(`${DAILY_DIGEST_ID}-`));
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
