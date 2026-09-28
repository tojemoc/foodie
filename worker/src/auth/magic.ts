import type { Env }              from '../types.js';
import { jsonResponse }          from '../lib/http.js';
import { generateOtpCode, generateRandomToken } from '../lib/encoding.js';
import { sendBrevoEmail }        from '../lib/brevo.js';
import { upsertUserByEmail, getUser, putMagicLink, getAndDeleteMagicLink } from '../lib/kv.js';
import { issueToken }            from './jwt.js';

const MAGIC_TTL_MS = 15 * 60 * 1_000; // 15 minutes
const CODE_ATTEMPT_LIMIT = 8;
const CODE_ATTEMPT_TTL_SEC = 900;

/** Pull a magic token out of a pasted URL / deep link / raw value. */
export function normalizeMagicCredential(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Bare 6-digit passcode
  if (/^\d{6}$/.test(trimmed)) return trimmed;

  // foodie://auth/verify?token=…  (or expo-linking foodie:///…)
  const foodie = trimmed.match(/^foodie:\/\/\/?auth\/verify\/?\?(?:[^#]*\b(?:token|magic|t)=([^&#]+))/i);
  if (foodie?.[1]) return decodeURIComponent(foodie[1]);

  // Absolute http(s) URL with ?magic= / ?token= / ?t=
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get('token')
        ?? url.searchParams.get('magic')
        ?? url.searchParams.get('t');
      if (fromQuery?.trim()) return fromQuery.trim();
    }
  } catch {
    // fall through
  }

  // Query-string fragment pasted alone: magic=… or token=…
  const qs = trimmed.match(/(?:^|[?&#])(?:token|magic|t)=([^&#]+)/i);
  if (qs?.[1]) {
    try { return decodeURIComponent(qs[1]); } catch { return qs[1]; }
  }

  return trimmed;
}

function magicDevEchoEnabled(env: Env): boolean {
  const v = env.MAGIC_DEV_ECHO?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/** Prefix ending after encoded email so delimiter-bearing addresses cannot collide. */
function codeAttemptPrefix(ip: string, email: string): string {
  return `magicfail:${ip}:${encodeURIComponent(email)}:`;
}

/**
 * Count failed-attempt slots under a shared prefix. Each failure writes its own
 * key so concurrent requests cannot under-count via read-modify-write races.
 */
async function countCodeAttempts(env: Env, ip: string, email: string): Promise<number> {
  const listed = await env.FOODIE_KV.list({ prefix: codeAttemptPrefix(ip, email) });
  return listed.keys.length;
}

async function checkCodeAttemptLimit(
  env: Env,
  ip: string,
  email: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const count = await countCodeAttempts(env, ip, email);
  if (count >= CODE_ATTEMPT_LIMIT) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Too many passcode attempts. Try again later.' }, 429, env),
    };
  }
  return { ok: true };
}

async function recordCodeAttempt(env: Env, ip: string, email: string): Promise<void> {
  const slot = crypto.randomUUID();
  await env.FOODIE_KV.put(`${codeAttemptPrefix(ip, email)}${slot}`, '1', {
    expirationTtl: CODE_ATTEMPT_TTL_SEC,
  });
}

// ── Send ──────────────────────────────────────────────────────────────────────

export async function magicSend(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email?: string }>();
  const email = body.email?.toLowerCase().trim();
  if (!email || !email.includes('@')) return jsonResponse({ error: 'Invalid email' }, 400, env);

  const userId = await upsertUserByEmail(env, email);
  const token  = generateRandomToken();
  const code   = generateOtpCode();

  await putMagicLink(env, {
    userId,
    email,
    expires: Date.now() + MAGIC_TTL_MS,
    token,
    code,
  });

  // Trusted frontend origin only — never echo the request Origin into emailed links.
  const origin = (env.FRONTEND_ORIGIN || 'https://foodie-prod.pages.dev').replace(/\/$/, '');
  const webUrl   = `${origin}/?magic=${encodeURIComponent(token)}`;
  const deepLink = `foodie://auth/verify?token=${encodeURIComponent(token)}`;

  if (!env.BREVO_API_KEY) {
    if (!magicDevEchoEnabled(env)) {
      return jsonResponse({ error: 'Magic link email is not configured (BREVO_API_KEY).' }, 503, env);
    }
    // Local testing only when MAGIC_DEV_ECHO=1
    return jsonResponse({
      ok: true,
      code,
      token,
      deepLink,
      webUrl,
      emailConfigured: false,
    }, 200, env);
  }

  const result = await sendBrevoEmail({
    apiKey:    env.BREVO_API_KEY,
    to:        email,
    fromEmail: env.EMAIL_FROM      || 'foodie@tjm.sk',
    fromName:  env.EMAIL_FROM_NAME || 'Foodie',
    subject:   'Your Foodie sign-in link',
    html:      buildEmailHtml({ webUrl, deepLink, code }),
  });

  if (!result.ok) {
    console.error('Brevo error:', result.body);
    return jsonResponse({ error: 'Failed to send email. Check BREVO_API_KEY.' }, 502, env);
  }

  // Do not echo token/code when email was delivered — inbox is the channel.
  return jsonResponse({ ok: true, emailConfigured: true }, 200, env);
}

// ── Verify ────────────────────────────────────────────────────────────────────

export async function magicVerify(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ token?: string; email?: string }>();
  const credential = normalizeMagicCredential(body.token ?? '');
  if (!credential) return jsonResponse({ error: 'Missing token' }, 400, env);

  const isCode = /^\d{6}$/.test(credential);
  const email = body.email?.toLowerCase().trim();
  if (isCode) {
    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Email is required when verifying a passcode' }, 400, env);
    }
    const limit = await checkCodeAttemptLimit(env, clientIp(request), email);
    if (!limit.ok) return limit.response;
  }

  const data = await getAndDeleteMagicLink(env, credential, isCode ? email : undefined);
  if (!data) {
    if (isCode && email) await recordCodeAttempt(env, clientIp(request), email);
    return jsonResponse({ error: 'Link expired or already used' }, 401, env);
  }
  if (isCode && email && data.email !== email) {
    await recordCodeAttempt(env, clientIp(request), email);
    return jsonResponse({ error: 'Link expired or already used' }, 401, env);
  }
  if (Date.now() > data.expires) return jsonResponse({ error: 'Link expired' }, 401, env);

  const user = await getUser(env, data.userId);
  if (!user) return jsonResponse({ error: 'User not found' }, 404, env);

  const jwtToken = await issueToken(data.userId, env);
  return jsonResponse({ token: jwtToken, userId: data.userId, username: user.username }, 200, env);
}

function buildEmailHtml(opts: { webUrl: string; deepLink: string; code: string }): string {
  const { webUrl, deepLink, code } = opts;
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9f9fb;border-radius:12px">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;color:#0a0a0f">Sign in to Foodie</h1>
      <p style="color:#555;margin:0 0 28px;line-height:1.6">
        Use the button below, open the Foodie app link, or enter the passcode.
        This sign-in expires in <strong>15 minutes</strong> and can only be used once.
      </p>
      <a href="${webUrl}"
         style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#7c6dfa,#fa6d9a);color:white;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px">
        Open sign-in page
      </a>
      <p style="color:#555;margin:28px 0 8px;line-height:1.6">
        Or enter this passcode in the Foodie app:
      </p>
      <p style="margin:0 0 24px;font-size:32px;letter-spacing:0.25em;font-weight:700;font-family:ui-monospace,monospace;color:#0a0a0f">
        ${code}
      </p>
      <p style="color:#555;margin:0 0 8px;line-height:1.6">
        SideStore / native testing — open Foodie directly:
      </p>
      <p style="margin:0 0 24px">
        <a href="${deepLink}" style="color:#7c6dfa;word-break:break-all">${deepLink}</a>
      </p>
      <p style="color:#999;font-size:12px;margin:0;line-height:1.6">
        If you didn't request this, you can safely ignore this email.<br/>
        Web handoff (does not sign you in until you confirm):<br/>
        <a href="${webUrl}" style="color:#7c6dfa;word-break:break-all">${webUrl}</a>
      </p>
    </div>`;
}
