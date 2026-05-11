import type { Env, User, Card } from '../types.js';
import { getCards as kvGetCards } from '../lib/kv.js';
import { sendBrevoEmail } from '../lib/brevo.js';

/** Max inclusive day offset from UTC "today" (0 = today). Spans `DIGEST_DAYS + 1` calendar days. */
const DIGEST_DAYS = 2;

/**
 * Daily cron: email each user a list of items expiring within the next few days.
 * Requires BREVO_API_KEY. Iterates KV keys with prefix `user:`.
 */
export async function runExpiryDigest(env: Env): Promise<void> {
  if (!env.BREVO_API_KEY) {
    console.warn('expiry-digest: BREVO_API_KEY not set, skipping');
    return;
  }

  let cursor: string | undefined;
  let processed = 0;
  let sent = 0;

  do {
    const list = await env.FOODIE_KV.list({ prefix: 'user:', cursor });
    for (const { name: key } of list.keys) {
      const userId = key.slice('user:'.length);
      if (!userId) continue;

      const user = await env.FOODIE_KV.get<User>(key, 'json');
      if (!user?.email) continue;

      const cards = (await kvGetCards(env, userId)) ?? [];
      const expiring = filterExpiringSoon(cards);
      if (!expiring.length) continue;

      const html = buildDigestHtml(expiring, env.FRONTEND_ORIGIN || 'https://foodie-prod.pages.dev');
      const result = await sendBrevoEmail({
        apiKey:    env.BREVO_API_KEY,
        to:        user.email,
        fromEmail: env.EMAIL_FROM      || 'foodie@tjm.sk',
        fromName:  env.EMAIL_FROM_NAME || 'Foodie',
        subject:   `Foodie — ${expiring.length} item(s) expiring in the next ${DIGEST_DAYS + 1} days`,
        html,
      });

      processed++;
      if (result.ok) sent++;
      else console.error('expiry-digest: Brevo failed for', user.email, result.body);
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  console.log(`expiry-digest: done — users checked ${processed}, emails sent ${sent}`);
}

function filterExpiringSoon(cards: Card[]): { name: string; expiry: string; placement: string }[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: { name: string; expiry: string; placement: string }[] = [];

  for (const c of cards) {
    if (!c.expiryDate) continue;
    const d = parseIsoDateUtc(c.expiryDate);
    if (!d) continue;
    const days = Math.floor((d.getTime() - today.getTime()) / 86_400_000);
    if (days < 0 || days > DIGEST_DAYS) continue;
    const name = c.productName || c.name || 'Item';
    const placement = c.placement || c.category || '—';
    out.push({ name, expiry: c.expiryDate, placement });
  }

  out.sort((a, b) => a.expiry.localeCompare(b.expiry));
  return out;
}

function parseIsoDateUtc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDigestHtml(
  rows: { name: string; expiry: string; placement: string }[],
  appOrigin: string,
): string {
  const rowsHtml = rows
    .map(
      r => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee">${escapeHtml(r.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(r.expiry)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555">${escapeHtml(r.placement)}</td>
      </tr>`,
    )
    .join('');

  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:28px 20px;background:#fafafa">
      <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#0a0a0f">Expiring soon</h1>
      <p style="color:#555;margin:0 0 20px;line-height:1.5">
        Here are items in your Foodie list expiring in the next <strong>${DIGEST_DAYS + 1}</strong> calendar days (including today).
      </p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <thead>
          <tr style="background:#f3f0ff;color:#3b2c6d">
            <th style="text-align:left;padding:12px;font-size:13px">Product</th>
            <th style="text-align:left;padding:12px;font-size:13px">Expiry</th>
            <th style="text-align:left;padding:12px;font-size:13px">Location</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin:24px 0 0">
        <a href="${escapeHtml(appOrigin)}/" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#7c6dfa,#fa6d9a);color:#fff;text-decoration:none;border-radius:10px;font-weight:600">
          Open Foodie
        </a>
      </p>
      <p style="color:#999;font-size:12px;margin:24px 0 0;line-height:1.5">
        You receive this because you have a Foodie account. Items are read from your last cloud sync.
      </p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
