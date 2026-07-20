import type { Env } from './types.js';
import { jsonResponse } from './lib/http.js';
import { verifyToken } from './auth/jwt.js';
import {
  putPushSubscription,
  deletePushSubscription,
  type StoredPushSubscription,
} from './lib/kv.js';

function isPrivateIPv4(a: number, b: number): boolean {
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  // Carrier-Grade NAT (100.64.0.0/10)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Multicast (224.0.0.0/4)
  if (a >= 224 && a <= 239) return true;
  return false;
}

function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [
    number,
    number,
    number,
    number,
  ];
  if (octets.some(n => n > 255)) return null;
  return octets;
}

/** Reject private / loopback push endpoints (SSRF guard). */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;

  const ipv4 = parseIpv4Octets(h);
  if (ipv4) return isPrivateIPv4(ipv4[0], ipv4[1]);

  // IPv4-mapped IPv6 (::ffff:192.0.2.1 or ::ffff:c000:201)
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(h);
  if (mappedDotted?.[1]) {
    const inner = parseIpv4Octets(mappedDotted[1]);
    if (!inner) return true;
    return isPrivateIPv4(inner[0], inner[1]);
  }

  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (mappedHex?.[1] && mappedHex[2]) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return true;
    return isPrivateIPv4((hi >> 8) & 0xff, hi & 0xff);
  }

  if (h.includes(':')) {
    // Link-local fe80::/10 → fe8–feb; ULA fc00::/7 → fc/fd; multicast ff00::/8 → ff
    if (
      /^fe[89ab]/.test(h) ||
      h.startsWith('fc') ||
      h.startsWith('fd') ||
      h.startsWith('ff')
    ) {
      return true;
    }
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

  await putPushSubscription(env, userId, incoming);
  return jsonResponse({ ok: true }, 201, env);
}

export async function pushUnsubscribe(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const body = await request.json<{ endpoint?: string }>().catch(() => null);
  if (!body?.endpoint || typeof body.endpoint !== 'string') {
    return jsonResponse({ error: 'endpoint is required' }, 400, env);
  }

  await deletePushSubscription(env, userId, body.endpoint);
  return jsonResponse({ ok: true }, 200, env);
}
