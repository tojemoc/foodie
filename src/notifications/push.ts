import { API_BASE } from '../api.js';
import { getSession } from '../auth/session.js';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** iOS Safari only delivers Web Push for installed Home Screen PWAs. */
export function isStandaloneDisplay(): boolean {
  return (
    (window.matchMedia?.('(display-mode: standalone)')?.matches ?? false) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  const ua = navigator.userAgent || '';
  const isTouchMac =
    /Macintosh/.test(ua) &&
    ((typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) ||
      'ontouchstart' in window);
  const isiOS = /iPad|iPhone|iPod/.test(ua) || isTouchMac;
  const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua);
  return isiOS && isSafari;
}

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, c => c.charCodeAt(0));
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.ready;
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/push/vapid-public-key`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `VAPID key unavailable (${res.status})`);
  }
  const data = await res.json() as { publicKey?: string };
  if (!data.publicKey) throw new Error('VAPID public key missing');
  return data.publicKey;
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error('Sign in to enable background alerts');

  const json = sub.toJSON();
  const res = await fetch(`${API_BASE}/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Subscribe failed (${res.status})`);
  }
}

/**
 * Request notification permission, subscribe via PushManager, and register
 * the endpoint with the Worker (KV key `pushsub:{userId}`).
 */
export async function enableWebPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) {
    if (isIosSafari() && !isStandaloneDisplay()) {
      return {
        ok: false,
        reason: 'On iPhone, add Foodie to your Home Screen, open it from there, then enable alerts',
      };
    }
    return { ok: false, reason: 'Web Push is not supported in this browser' };
  }

  if (isIosSafari() && !isStandaloneDisplay()) {
    return {
      ok: false,
      reason: 'On iPhone, add Foodie to your Home Screen, open it from there, then enable alerts',
    };
  }

  const session = getSession();
  if (!session?.token) {
    return { ok: false, reason: 'Sign in to enable background expiry alerts' };
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return {
      ok: false,
      reason: perm === 'denied'
        ? 'Notifications blocked — enable them in system settings'
        : 'Expiry alerts stay off until you allow notifications',
    };
  }

  let vapidPublicKey: string;
  try {
    vapidPublicKey = await fetchVapidPublicKey();
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Push server not configured',
    };
  }

  const reg = await getServiceWorkerRegistration();
  const existingSubscription = await reg.pushManager.getSubscription();
  const browserSub: { current: PushSubscription | null } = { current: existingSubscription };

  const doSubscribe = async (): Promise<void> => {
    if (!browserSub.current) {
      const applicationServerKey = urlB64ToUint8Array(vapidPublicKey);
      browserSub.current = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
    }
    await postSubscription(browserSub.current);
  };

  try {
    await doSubscribe();
  } catch (firstError) {
    // Stale subscription (wrong VAPID key) — drop and retry once.
    if (existingSubscription) {
      await existingSubscription.unsubscribe().catch(() => {});
      browserSub.current = null;
      try {
        await doSubscribe();
      } catch (retryError) {
        const rollback = browserSub.current as PushSubscription | null;
        if (rollback) await rollback.unsubscribe().catch(() => {});
        return {
          ok: false,
          reason: retryError instanceof Error ? retryError.message : 'Failed to enable push',
        };
      }
    } else {
      const rollback = browserSub.current as PushSubscription | null;
      if (rollback) await rollback.unsubscribe().catch(() => {});
      return {
        ok: false,
        reason: firstError instanceof Error ? firstError.message : 'Failed to enable push',
      };
    }
  }

  return { ok: true };
}

/** Re-POST an existing browser subscription after login (account switch). */
export async function reconcileWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  const session = getSession();
  if (!session?.token) return;

  try {
    const reg = await getServiceWorkerRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await postSubscription(sub);
  } catch (err) {
    console.warn('Push reconciliation failed:', err);
  }
}
