import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type Base64URLString,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

export interface Env {
  /** Set per deploy via `wrangler deploy --var VERSION=...` */
  VERSION?: string;
  FOODIE_KV?: KVNamespace;
  WEBAPP_ORIGIN?: string;
  RP_ID?: string;
  SESSION_TTL_SECONDS?: string;
  MAGIC_LINK_TTL_SECONDS?: string;
  RESEND_API_KEY?: string;
  MAGIC_LINK_FROM_EMAIL?: string;
}

type StoredPasskey = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
};

type StoredUser = {
  id: string;
  email: string;
  passkeys: StoredPasskey[];
  createdAt: string;
  updatedAt: string;
};

type StoredSession = {
  userId: string;
  email: string;
  createdAt: string;
};

type StoredMagicLink = {
  userId: string;
  email: string;
  createdAt: string;
};

type StoredChallenge = {
  challenge: string;
  userId?: string;
  createdAt: string;
};

type SyncPayload = {
  items: unknown[];
  locations: unknown[];
  clientUpdatedAt?: string;
  updatedAt: string;
};

const SESSION_COOKIE = 'foodie_session';
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_MAGIC_LINK_TTL_SECONDS = 60 * 15;
const DEFAULT_CHALLENGE_TTL_SECONDS = 60 * 5;

const MAGIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      if (path === '/health') {
        return withCors(Response.json({ ok: true, service: 'foodie-api' }), request, env);
      }

      if (path === '/version') {
        return withCors(
          Response.json({
            version: env.VERSION ?? 'unknown',
          }),
          request,
          env,
        );
      }

      if (path === '/auth/magic-link/start' && request.method === 'POST') {
        return withCors(await startMagicLink(request, env), request, env);
      }

      if (path === '/auth/magic-link/verify' && request.method === 'POST') {
        return withCors(await verifyMagicLink(request, env), request, env);
      }

      if (path === '/auth/me' && request.method === 'GET') {
        return withCors(await getCurrentUser(request, env), request, env);
      }

      if (path === '/auth/logout' && request.method === 'POST') {
        return withCors(await logout(request, env), request, env);
      }

      if (path === '/auth/passkey/register/options' && request.method === 'POST') {
        return withCors(await passkeyRegistrationOptions(request, env), request, env);
      }

      if (path === '/auth/passkey/register/verify' && request.method === 'POST') {
        return withCors(await passkeyRegistrationVerify(request, env), request, env);
      }

      if (path === '/auth/passkey/authenticate/options' && request.method === 'POST') {
        return withCors(await passkeyAuthenticationOptions(request, env), request, env);
      }

      if (path === '/auth/passkey/authenticate/verify' && request.method === 'POST') {
        return withCors(await passkeyAuthenticationVerify(request, env), request, env);
      }

      if (path === '/sync' && request.method === 'GET') {
        return withCors(await pullSyncSnapshot(request, env), request, env);
      }

      if (path === '/sync' && request.method === 'PUT') {
        return withCors(await pushSyncSnapshot(request, env), request, env);
      }

      return withCors(new Response('Not Found', { status: 404 }), request, env);
    } catch (error) {
      console.error('Unhandled API error', error);
      return withCors(
        Response.json({ error: 'Internal server error' }, { status: 500 }),
        request,
        env,
      );
    }
  },
};

function normalizePath(path: string): string {
  return path.replace(/\/$/, '') || '/';
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', resolveAllowedOrigin(origin, env));
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    headers.set('Vary', 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveAllowedOrigin(origin: string, env: Env): string {
  if (env.WEBAPP_ORIGIN) {
    return origin === env.WEBAPP_ORIGIN ? origin : env.WEBAPP_ORIGIN;
  }
  return origin;
}

function requireKV(env: Env): KVNamespace {
  if (!env.FOODIE_KV) {
    throw new Error('FOODIE_KV binding is not configured');
  }
  return env.FOODIE_KV;
}

function errorJson(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseRequestCookie(request: Request, name: string): string | undefined {
  const rawCookie = request.headers.get('Cookie') ?? '';
  const cookies = rawCookie.split(';').map((entry) => entry.trim());
  for (const cookie of cookies) {
    const [cookieName, ...valueParts] = cookie.split('=');
    if (cookieName === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }
  return undefined;
}

function makeSessionSetCookie(sessionId: string, request: Request, env: Env): string {
  const ttl = Number(env.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  const secure = new URL(request.url).protocol === 'https:';
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttl}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:';
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function userEmailKey(email: string): string {
  return `user:email:${email.toLowerCase()}`;
}

function userIdKey(userId: string): string {
  return `user:id:${userId}`;
}

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function magicLinkKey(token: string): string {
  return `magic:${token}`;
}

function challengeKey(namespace: string, id: string): string {
  return `challenge:${namespace}:${id}`;
}

function passkeyLookupKey(passkeyId: string): string {
  return `passkey:${passkeyId}`;
}

function syncKey(userId: string): string {
  return `sync:${userId}`;
}

async function getUserById(env: Env, userId: string): Promise<StoredUser | null> {
  const kv = requireKV(env);
  return kv.get<StoredUser>(userIdKey(userId), 'json');
}

async function saveUser(env: Env, user: StoredUser): Promise<void> {
  const kv = requireKV(env);
  await Promise.all([
    kv.put(userIdKey(user.id), JSON.stringify(user)),
    kv.put(userEmailKey(user.email), user.id),
  ]);
}

async function getOrCreateUserByEmail(env: Env, email: string): Promise<StoredUser> {
  const kv = requireKV(env);
  const normalizedEmail = email.trim().toLowerCase();
  const existingId = await kv.get(userEmailKey(normalizedEmail));
  if (existingId) {
    const existingUser = await getUserById(env, existingId);
    if (existingUser) {
      return existingUser;
    }
  }

  const now = nowIso();
  const newUser: StoredUser = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passkeys: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveUser(env, newUser);
  return newUser;
}

async function getSession(env: Env, request: Request): Promise<StoredSession | null> {
  const kv = requireKV(env);
  const sessionId = parseRequestCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  return kv.get<StoredSession>(sessionKey(sessionId), 'json');
}

async function requireSession(env: Env, request: Request): Promise<StoredSession | null> {
  const session = await getSession(env, request);
  return session ?? null;
}

async function createSessionResponse(user: StoredUser, request: Request, env: Env): Promise<Response> {
  const kv = requireKV(env);
  const ttl = Number(env.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  const sessionId = randomToken();
  const session: StoredSession = {
    userId: user.id,
    email: user.email,
    createdAt: nowIso(),
  };
  await kv.put(sessionKey(sessionId), JSON.stringify(session), {
    expirationTtl: ttl,
  });
  return Response.json(
    {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        passkeyCount: user.passkeys.length,
      },
    },
    {
      headers: {
        'Set-Cookie': makeSessionSetCookie(sessionId, request, env),
      },
    },
  );
}

async function startMagicLink(request: Request, env: Env): Promise<Response> {
  const kv = requireKV(env);
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid request body');
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !MAGIC_EMAIL_REGEX.test(email)) {
    return errorJson('Valid email is required');
  }

  const user = await getOrCreateUserByEmail(env, email);
  const token = randomToken();
  const ttl = Number(env.MAGIC_LINK_TTL_SECONDS || DEFAULT_MAGIC_LINK_TTL_SECONDS);
  const payload: StoredMagicLink = {
    userId: user.id,
    email: user.email,
    createdAt: nowIso(),
  };
  await kv.put(magicLinkKey(token), JSON.stringify(payload), {
    expirationTtl: ttl,
  });

  const appOrigin = env.WEBAPP_ORIGIN || request.headers.get('Origin') || new URL(request.url).origin;
  const magicLink = `${appOrigin.replace(/\/$/, '')}/settings?magic_token=${encodeURIComponent(token)}`;

  const sent = await maybeSendMagicEmail(env, email, magicLink);

  return Response.json({
    ok: true,
    delivered: sent,
    expiresInSeconds: ttl,
    magicLink: sent ? undefined : magicLink,
  });
}

async function maybeSendMagicEmail(env: Env, recipient: string, magicLink: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAGIC_LINK_FROM_EMAIL) {
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAGIC_LINK_FROM_EMAIL,
      to: [recipient],
      subject: 'Your Foodie magic sign-in link',
      html: `<p>Tap to sign in to Foodie:</p><p><a href="${magicLink}">Sign in to Foodie</a></p><p>This link expires in 15 minutes.</p>`,
    }),
  });
  return res.ok;
}

async function verifyMagicLink(request: Request, env: Env): Promise<Response> {
  const kv = requireKV(env);
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid request body');
  }

  const token = body.token?.trim();
  if (!token) {
    return errorJson('Token is required');
  }

  const record = await kv.get<StoredMagicLink>(magicLinkKey(token), 'json');
  if (!record) {
    return errorJson('Magic link is invalid or expired');
  }

  await kv.delete(magicLinkKey(token));
  const user = await getUserById(env, record.userId);
  if (!user) {
    return errorJson('User no longer exists', 404);
  }

  return createSessionResponse(user, request, env);
}

async function getCurrentUser(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  if (!session) {
    return errorJson('Not authenticated', 401);
  }

  const user = await getUserById(env, session.userId);
  if (!user) {
    return errorJson('Session user no longer exists', 401);
  }

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      passkeyCount: user.passkeys.length,
    },
  });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const kv = requireKV(env);
  const sessionId = parseRequestCookie(request, SESSION_COOKIE);
  if (sessionId) {
    await kv.delete(sessionKey(sessionId));
  }
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie(request) } },
  );
}

async function passkeyRegistrationOptions(request: Request, env: Env): Promise<Response> {
  let body: { email?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is allowed for session-backed registration.
  }

  let user: StoredUser | null = null;
  const session = await requireSession(env, request);
  if (session) {
    user = await getUserById(env, session.userId);
  } else if (body.email) {
    user = await getOrCreateUserByEmail(env, body.email);
  }

  if (!user) {
    return errorJson('Provide email or sign in before registering a passkey', 401);
  }

  const options = await generateRegistrationOptions({
    rpName: 'Foodie',
    rpID: getRpId(request, env),
    userName: user.email,
    userID: stringToBuffer(user.id),
    userDisplayName: user.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: user.passkeys.map((pk) => ({
      id: pk.id,
      transports: pk.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb' | 'cable')[] | undefined,
    })),
  });

  const kv = requireKV(env);
  await kv.put(
    challengeKey('register', user.id),
    JSON.stringify({
      challenge: options.challenge,
      userId: user.id,
      createdAt: nowIso(),
    } satisfies StoredChallenge),
    { expirationTtl: DEFAULT_CHALLENGE_TTL_SECONDS },
  );

  return Response.json({ ok: true, options });
}

async function passkeyRegistrationVerify(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  if (!session) {
    return errorJson('Not authenticated', 401);
  }

  const user = await getUserById(env, session.userId);
  if (!user) {
    return errorJson('User no longer exists', 404);
  }

  const kv = requireKV(env);
  const storedChallenge = await kv.get<StoredChallenge>(challengeKey('register', user.id), 'json');
  if (!storedChallenge?.challenge) {
    return errorJson('Registration challenge expired');
  }

  let body: { response?: RegistrationResponseJSON };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid request body');
  }
  if (!body.response) {
    return errorJson('Passkey registration response is required');
  }

  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: getExpectedOrigin(request, env),
    expectedRPID: getRpId(request, env),
  });

  if (!verification.verified || !verification.registrationInfo) {
    return errorJson('Passkey registration could not be verified');
  }

  const credential = verification.registrationInfo.credential;
  const duplicate = user.passkeys.some((pk) => pk.id === credential.id);
  if (!duplicate) {
    user.passkeys.push({
      id: credential.id,
      publicKey: bytesToBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports?.map((item) => String(item)),
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      createdAt: nowIso(),
    });
  }
  user.updatedAt = nowIso();
  await Promise.all([
    saveUser(env, user),
    kv.put(passkeyLookupKey(credential.id), user.id),
    kv.delete(challengeKey('register', user.id)),
  ]);

  return Response.json({
    ok: true,
    passkeyCount: user.passkeys.length,
  });
}

async function passkeyAuthenticationOptions(request: Request, env: Env): Promise<Response> {
  let body: { email?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is allowed.
  }

  let allowCredentials: { id: string; transports?: ('ble' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb' | 'cable')[] }[] | undefined;
  let challengeUserId: string | undefined;
  if (body.email) {
    const user = await getOrCreateUserByEmail(env, body.email);
    challengeUserId = user.id;
    allowCredentials = user.passkeys.map((pk) => ({
      id: pk.id,
      transports: pk.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb' | 'cable')[] | undefined,
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpId(request, env),
    userVerification: 'preferred',
    allowCredentials: allowCredentials?.length ? allowCredentials : undefined,
  });

  const kv = requireKV(env);
  await kv.put(
    challengeKey('login', options.challenge),
    JSON.stringify({
      challenge: options.challenge,
      userId: challengeUserId,
      createdAt: nowIso(),
    } satisfies StoredChallenge),
    { expirationTtl: DEFAULT_CHALLENGE_TTL_SECONDS },
  );

  return Response.json({ ok: true, options });
}

async function passkeyAuthenticationVerify(request: Request, env: Env): Promise<Response> {
  let body: { response?: AuthenticationResponseJSON; challenge?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid request body');
  }

  if (!body.response || !body.challenge) {
    return errorJson('Passkey response and challenge are required');
  }

  const kv = requireKV(env);
  const storedChallenge = await kv.get<StoredChallenge>(challengeKey('login', body.challenge), 'json');
  if (!storedChallenge?.challenge) {
    return errorJson('Authentication challenge expired');
  }

  const userId = await kv.get(passkeyLookupKey(body.response.id));
  if (!userId) {
    return errorJson('Passkey is not registered', 404);
  }
  if (storedChallenge.userId && storedChallenge.userId !== userId) {
    return errorJson('Passkey does not match requested account', 403);
  }

  const user = await getUserById(env, userId);
  if (!user) {
    return errorJson('User no longer exists', 404);
  }

  const storedPasskey = user.passkeys.find((pk) => pk.id === body.response!.id);
  if (!storedPasskey) {
    return errorJson('Passkey was not found on user account', 404);
  }

  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: getExpectedOrigin(request, env),
    expectedRPID: getRpId(request, env),
    credential: {
      id: storedPasskey.id,
      publicKey: base64UrlToBuffer(storedPasskey.publicKey),
      counter: storedPasskey.counter,
      transports: storedPasskey.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb' | 'cable')[] | undefined,
    },
  });

  if (!verification.verified) {
    return errorJson('Passkey verification failed');
  }

  storedPasskey.counter = verification.authenticationInfo.newCounter;
  storedPasskey.deviceType = verification.authenticationInfo.credentialDeviceType;
  storedPasskey.backedUp = verification.authenticationInfo.credentialBackedUp;
  user.updatedAt = nowIso();
  await Promise.all([
    saveUser(env, user),
    kv.delete(challengeKey('login', body.challenge)),
  ]);

  return createSessionResponse(user, request, env);
}

async function pullSyncSnapshot(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  if (!session) {
    return errorJson('Not authenticated', 401);
  }
  const kv = requireKV(env);
  const snapshot = await kv.get<SyncPayload>(syncKey(session.userId), 'json');
  return Response.json({
    ok: true,
    snapshot: snapshot ?? null,
  });
}

async function pushSyncSnapshot(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  if (!session) {
    return errorJson('Not authenticated', 401);
  }
  let body: { items?: unknown[]; locations?: unknown[]; clientUpdatedAt?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid request body');
  }

  if (!Array.isArray(body.items) || !Array.isArray(body.locations)) {
    return errorJson('items and locations arrays are required');
  }

  const kv = requireKV(env);
  const payload: SyncPayload = {
    items: body.items,
    locations: body.locations,
    clientUpdatedAt: body.clientUpdatedAt,
    updatedAt: nowIso(),
  };
  await kv.put(syncKey(session.userId), JSON.stringify(payload));

  return Response.json({
    ok: true,
    updatedAt: payload.updatedAt,
  });
}

function getExpectedOrigin(request: Request, env: Env): string {
  if (env.WEBAPP_ORIGIN) return env.WEBAPP_ORIGIN.replace(/\/$/, '');
  const headerOrigin = request.headers.get('Origin');
  if (headerOrigin) return headerOrigin.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

function getRpId(request: Request, env: Env): string {
  if (env.RP_ID) return env.RP_ID;
  const origin = getExpectedOrigin(request, env);
  return new URL(origin).hostname;
}

function stringToBuffer(input: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(input);
  const buffer = new ArrayBuffer(bytes.length);
  const out = new Uint8Array(buffer);
  out.set(bytes);
  return out;
}

function base64UrlToBuffer(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBufferLike>): Base64URLString {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

