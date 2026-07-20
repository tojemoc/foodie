import {
  fetchVapidPublicKey as apiFetchVapidPublicKey,
  registerPushSubscription,
} from '../api.js';
import { getSession } from '../auth/session.js';

const SW_TIMEOUT_MS = 10_000;
const API_TIMEOUT_MS = 10_000;

export type PushEnableFailureCode =
  | 'ios_homescreen'
  | 'unsupported'
  | 'unconfigured'
  | 'auth'
  | 'permission_denied'
  | 'permission_default'
  | 'failed'
  | 'timeout';

export type PushEnableResult =
  | { ok: true }
  | { ok: false; code: PushEnableFailureCode; reason: string };

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await withTimeout(
    navigator.serviceWorker.getRegistration(),
    SW_TIMEOUT_MS,
    'Service worker lookup',
  );
  if (existing) return existing;
  return withTimeout(navigator.serviceWorker.ready, SW_TIMEOUT_MS, 'Service worker ready');
}

async function fetchVapidPublicKey(): Promise<string> {
  const data = await withTimeout(apiFetchVapidPublicKey(), API_TIMEOUT_MS, 'VAPID key request');
  if (data.error || !data.publicKey) {
    throw new Error(data.error || 'VAPID public key missing');
  }
  return data.publicKey;
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error('Sign in to enable background alerts');

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Push subscription missing endpoint or keys');
  }

  const data = await withTimeout(
    registerPushSubscription({
      endpoint: json.endpoint,
      keys: { p256dh, auth },
    }),
    API_TIMEOUT_MS,
    'Push subscribe request',
  );

  if (data.error) throw new Error(data.error);
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && /timed out$/i.test(err.message);
}

/**
 * Request notification permission, subscribe via PushManager, and register
 * the endpoint with the Worker (KV key `pushsub:{userId}:{endpointHash}`).
 */
export async function enableWebPush(): Promise<PushEnableResult> {
  if (!isPushSupported()) {
    if (isIosSafari() && !isStandaloneDisplay()) {
      return {
        ok: false,
        code: 'ios_homescreen',
        reason: 'On iPhone, add Foodie to your Home Screen, open it from there, then enable alerts',
      };
    }
    return { ok: false, code: 'unsupported', reason: 'Web Push is not supported in this browser' };
  }

  if (isIosSafari() && !isStandaloneDisplay()) {
    return {
      ok: false,
      code: 'ios_homescreen',
      reason: 'On iPhone, add Foodie to your Home Screen, open it from there, then enable alerts',
    };
  }

  const session = getSession();
  if (!session?.token) {
    return { ok: false, code: 'auth', reason: 'Sign in to enable background expiry alerts' };
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return {
      ok: false,
      code: perm === 'denied' ? 'permission_denied' : 'permission_default',
      reason: perm === 'denied'
        ? 'Notifications blocked — enable them in system settings'
        : 'Expiry alerts stay off until you allow notifications',
    };
  }

  let vapidPublicKey: string;
  try {
    vapidPublicKey = await fetchVapidPublicKey();
  } catch (e) {
    if (isTimeoutError(e)) {
      return { ok: false, code: 'timeout', reason: e instanceof Error ? e.message : 'Request timed out' };
    }
    return {
      ok: false,
      code: 'unconfigured',
      reason: e instanceof Error ? e.message : 'Push server not configured',
    };
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await getServiceWorkerRegistration();
  } catch (e) {
    return {
      ok: false,
      code: isTimeoutError(e) ? 'timeout' : 'failed',
      reason: e instanceof Error ? e.message : 'Service worker unavailable',
    };
  }

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
          code: isTimeoutError(retryError) ? 'timeout' : 'failed',
          reason: retryError instanceof Error ? retryError.message : 'Failed to enable push',
        };
      }
    } else {
      const rollback = browserSub.current as PushSubscription | null;
      if (rollback) await rollback.unsubscribe().catch(() => {});
      return {
        ok: false,
        code: isTimeoutError(firstError) ? 'timeout' : 'failed',
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
