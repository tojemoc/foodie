import type { Env, UserPrefs } from './types.js';
import { jsonResponse } from './lib/http.js';
import { verifyToken } from './auth/jwt.js';
import { DEFAULT_DIGEST_TIMEZONE, getUserPrefs, putUserPrefs } from './lib/kv.js';

const IANA_TZ = /^[A-Za-z0-9_+\-/]+$/;

function sanitizeTimezone(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DIGEST_TIMEZONE;
  const tz = raw.trim();
  if (!tz || tz.length > 64 || !IANA_TZ.test(tz)) return DEFAULT_DIGEST_TIMEZONE;
  try {
    // Throws RangeError for unknown zones in supporting runtimes.
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_DIGEST_TIMEZONE;
  }
}

export async function getPrefs(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);
  const prefs = await getUserPrefs(env, userId);
  return jsonResponse(prefs, 200, env);
}

export async function putPrefs(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const body = await request.json<{
    emailDigest?: boolean;
    timezone?: string;
  }>().catch(() => null);

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Invalid body' }, 400, env);
  }

  const current = await getUserPrefs(env, userId);
  const next: UserPrefs = {
    emailDigest: typeof body.emailDigest === 'boolean' ? body.emailDigest : current.emailDigest,
    timezone: body.timezone !== undefined ? sanitizeTimezone(body.timezone) : current.timezone,
    lastDigestLocalDate: current.lastDigestLocalDate,
    updatedAt: new Date().toISOString(),
  };

  await putUserPrefs(env, userId, next);
  return jsonResponse(next, 200, env);
}
