import type { Env } from './types.js';
import { jsonResponse } from './lib/http.js';
import { verifyToken } from './auth/jwt.js';
import {
  getPushSubscriptions,
  putPushSubscriptions,
  type StoredPushSubscription,
} from './lib/kv.js';

/** Reject private / loopback push endpoints (SSRF guard). */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  if (h.includes(':')) {
    if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('ff')) return true;
  }
  return false;
}

export async function getVapidPublicKey(_request: Request, env: Env): Promise<Response> {
  if (!env.VAPID_PUBLIC_KEY) {
    return jsonResponse({ error: 'Push notifications not configured' }, 503, env);
  }
  return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY }, 200, env);
}

export async function pushSubscribe(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const body = await request.json<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  }>().catch(() => null);

  if (
    typeof body?.endpoint !== 'string' ||
    typeof body?.keys?.p256dh !== 'string' ||
    typeof body?.keys?.auth !== 'string'
  ) {
    return jsonResponse({ error: 'Invalid push subscription object' }, 400, env);
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(body.endpoint);
  } catch {
    return jsonResponse({ error: 'Invalid push endpoint' }, 400, env);
  }
  if (endpointUrl.protocol !== 'https:' || isPrivateHost(endpointUrl.hostname)) {
    return jsonResponse({ error: 'Invalid push endpoint' }, 400, env);
  }

  const incoming: StoredPushSubscription = {
    endpoint:  body.endpoint,
    p256dh:    body.keys.p256dh,
    auth:      body.keys.auth,
    createdAt: new Date().toISOString(),
  };

  const existing = (await getPushSubscriptions(env, userId)) ?? [];
  const next = existing.filter((s: StoredPushSubscription) => s.endpoint !== incoming.endpoint);
  next.push(incoming);
  await putPushSubscriptions(env, userId, next);

  return jsonResponse({ ok: true }, 201, env);
}

export async function pushUnsubscribe(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const body = await request.json<{ endpoint?: string }>().catch(() => null);
  if (!body?.endpoint || typeof body.endpoint !== 'string') {
    return jsonResponse({ error: 'endpoint is required' }, 400, env);
  }

  const existing = (await getPushSubscriptions(env, userId)) ?? [];
  const next = existing.filter((s: StoredPushSubscription) => s.endpoint !== body.endpoint);
  await putPushSubscriptions(env, userId, next);

  return jsonResponse({ ok: true }, 200, env);
}
