import type { Env }          from './types.js';
import { corsHeaders, jsonResponse } from './lib/http.js';
import { registerBegin, registerFinish, loginBegin, loginFinish } from './auth/passkey.js';
import { magicSend, magicVerify }    from './auth/magic.js';
import { verifyToken }               from './auth/jwt.js';
import { getItems, setItems, getCardsLegacy, setCardsLegacy } from './items.js';
import { getVapidPublicKey, pushSubscribe, pushUnsubscribe } from './push.js';
import { getPrefs, putPrefs }        from './prefs.js';
import { getUser }                   from './lib/kv.js';
import { runExpiryDigest }           from './scheduled/expiry-digest.js';

export { MagicLinkGate } from './auth/magic-gate.js';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runExpiryDigest(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestOrigin = request.headers.get('Origin') ?? undefined;
    const cors          = corsHeaders(env, requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);

    let response: Response;

    try {
      // ── Auth — passkey ──────────────────────────────────────────────────────
      if (pathname === '/auth/register/begin'  && request.method === 'POST') response = await registerBegin(request, env);
      else if (pathname === '/auth/register/finish' && request.method === 'POST') response = await registerFinish(request, env);
      else if (pathname === '/auth/login/begin'     && request.method === 'POST') response = await loginBegin(request, env);
      else if (pathname === '/auth/login/finish'    && request.method === 'POST') response = await loginFinish(request, env);

      // ── Auth — magic link ───────────────────────────────────────────────────
      else if (pathname === '/auth/magic/send'   && request.method === 'POST') response = await magicSend(request, env);
      else if (pathname === '/auth/magic/verify' && request.method === 'POST') response = await magicVerify(request, env);

      // ── Session ─────────────────────────────────────────────────────────────
      else if (pathname === '/auth/me' && request.method === 'GET') {
        const { userId, error } = await verifyToken(request, env);
        if (error || !userId) response = jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);
        else {
          const user = await getUser(env, userId);
          response = user
            ? jsonResponse(user, 200, env)
            : jsonResponse({ error: 'User not found' }, 404, env);
        }
      }

      // ── Items ────────────────────────────────────────────────────────────────
      else if (pathname === '/items' && request.method === 'GET')  response = await getItems(request, env);
      else if (pathname === '/items' && request.method === 'POST') response = await setItems(request, env, ctx);
      // Legacy Cardex path (same handlers; GET still returns `cards` for old clients)
      else if (pathname === '/cards' && request.method === 'GET')  response = await getCardsLegacy(request, env);
      else if (pathname === '/cards' && request.method === 'POST') response = await setCardsLegacy(request, env, ctx);

      // ── Web Push ─────────────────────────────────────────────────────────────
      else if (pathname === '/push/vapid-public-key' && request.method === 'GET')  response = await getVapidPublicKey(request, env);
      else if (pathname === '/push/subscribe'       && request.method === 'POST') response = await pushSubscribe(request, env);
      else if (pathname === '/push/subscribe'       && request.method === 'DELETE') response = await pushUnsubscribe(request, env);

      // ── Notification prefs (email digest opt-in + timezone) ─────────────────
      else if (pathname === '/prefs' && request.method === 'GET')  response = await getPrefs(request, env);
      else if (pathname === '/prefs' && request.method === 'PUT')  response = await putPrefs(request, env);

      else response = jsonResponse({ error: 'Not found' }, 404, env);

    } catch (err) {
      console.error(err);
      const detail = err instanceof Error ? err.message : String(err);
      response = jsonResponse({ error: 'Internal error', detail }, 500, env);
    }

    // Stamp CORS headers onto every response — single place, covers all handlers.
    const patched = new Response(response.body, response);
    Object.entries(cors).forEach(([k, v]) => patched.headers.set(k, v));
    return patched;
  },
};

