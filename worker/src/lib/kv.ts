import type { Env, User, Credential, ChallengeData, MagicLinkData, Item, Tombstone } from '../types.js';

// ── User ─────────────────────────────────────────────────────────────────────

export const getUser = (env: Env, userId: string) =>
  env.FOODIE_KV.get<User>(`user:${userId}`, 'json');

export const putUser = (env: Env, user: User) =>
  env.FOODIE_KV.put(`user:${user.id}`, JSON.stringify(user));

export const getUserIdByEmail = (env: Env, email: string) =>
  env.FOODIE_KV.get(`email:${email}`);

export const putEmailIndex = (env: Env, email: string, userId: string) =>
  env.FOODIE_KV.put(`email:${email}`, userId);

// ── Credential ────────────────────────────────────────────────────────────────

export const getCredential = (env: Env, credId: string) =>
  env.FOODIE_KV.get<Credential>(`cred:${credId}`, 'json');

export const putCredential = (env: Env, credId: string, cred: Credential) =>
  env.FOODIE_KV.put(`cred:${credId}`, JSON.stringify(cred));

// ── Challenge ─────────────────────────────────────────────────────────────────

export const putChallenge = (env: Env, token: string, data: ChallengeData) =>
  env.FOODIE_KV.put(`challenge:${token}`, JSON.stringify(data), { expirationTtl: 300 });

export async function getAndDeleteChallenge(
  env:   Env,
  token: string,
): Promise<ChallengeData | null> {
  const data = await env.FOODIE_KV.get<ChallengeData>(`challenge:${token}`, 'json');
  if (data) await env.FOODIE_KV.delete(`challenge:${token}`);
  return data;
}

// ── Magic link ────────────────────────────────────────────────────────────────

export const putMagicLink = (env: Env, token: string, data: MagicLinkData) =>
  env.FOODIE_KV.put(`magiclink:${token}`, JSON.stringify(data), { expirationTtl: 900 });

export async function getAndDeleteMagicLink(
  env:   Env,
  token: string,
): Promise<MagicLinkData | null> {
  const data = await env.FOODIE_KV.get<MagicLinkData>(`magiclink:${token}`, 'json');
  if (data) await env.FOODIE_KV.delete(`magiclink:${token}`);
  return data;
}

// ── Items (legacy KV key `cards:` still read for migration) ───────────────────

export async function getItems(env: Env, userId: string): Promise<Item[] | null> {
  const modern = await env.FOODIE_KV.get<Item[]>(`items:${userId}`, 'json');
  if (modern) return modern;
  return env.FOODIE_KV.get<Item[]>(`cards:${userId}`, 'json');
}

export async function putItems(env: Env, userId: string, items: Item[]): Promise<void> {
  await env.FOODIE_KV.put(`items:${userId}`, JSON.stringify(items));
  // Drop legacy key after a successful write so digests/clients converge.
  await env.FOODIE_KV.delete(`cards:${userId}`);
}

/** @deprecated Use getItems */
export const getCards = getItems;
/** @deprecated Use putItems */
export const putCards = putItems;

// ── Web Push subscriptions ────────────────────────────────────────────────────
// One KV record per endpoint: `pushsub:{userId}:{endpointHash}` — avoids
// read-modify-write races across devices updating different subscriptions.

export interface StoredPushSubscription {
  endpoint:  string;
  p256dh:    string;
  auth:      string;
  createdAt: string;
}

async function endpointKeyHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function pushSubKey(userId: string, endpointHash: string): string {
  return `pushsub:${userId}:${endpointHash}`;
}

export async function getPushSubscriptions(
  env: Env,
  userId: string,
): Promise<StoredPushSubscription[]> {
  const prefix = `pushsub:${userId}:`;
  const out: StoredPushSubscription[] = [];
  let cursor: string | undefined;

  do {
    const list = await env.FOODIE_KV.list({ prefix, cursor });
    const names = list.keys.map(k => k.name);
    const values = await Promise.all(
      names.map(name => env.FOODIE_KV.get<StoredPushSubscription>(name, 'json')),
    );
    for (const sub of values) {
      if (sub?.endpoint && sub.p256dh && sub.auth) out.push(sub);
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return out;
}

export async function putPushSubscription(
  env: Env,
  userId: string,
  sub: StoredPushSubscription,
): Promise<void> {
  const hash = await endpointKeyHash(sub.endpoint);
  await env.FOODIE_KV.put(pushSubKey(userId, hash), JSON.stringify(sub));
}

export async function deletePushSubscription(
  env: Env,
  userId: string,
  endpoint: string,
): Promise<void> {
  const hash = await endpointKeyHash(endpoint);
  await env.FOODIE_KV.delete(pushSubKey(userId, hash));
}

// ── Tombstones ────────────────────────────────────────────────────────────────

export const getTombstones = (env: Env, userId: string) =>
  env.FOODIE_KV.get<Tombstone[]>(`tombstones:${userId}`, 'json');

export const putTombstones = (env: Env, userId: string, tombstones: Tombstone[]) =>
  env.FOODIE_KV.put(`tombstones:${userId}`, JSON.stringify(tombstones));

// ── User upsert (shared by passkey + magic link registration) ─────────────────

export async function upsertUserByEmail(
  env:   Env,
  email: string,
): Promise<string> {
  const existing = await getUserIdByEmail(env, email);
  if (existing) return existing;

  const userId   = crypto.randomUUID();
  const username = (email.split('@')[0] ?? '').replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'user';

  await putUser(env, { id: userId, username, email, createdAt: new Date().toISOString() });
  await putEmailIndex(env, email, userId);

  return userId;
}
