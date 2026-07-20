import type { Env, User, Credential, ChallengeData, MagicLinkData, Card, Tombstone } from '../types.js';

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

// ── Cards ─────────────────────────────────────────────────────────────────────

export const getCards = (env: Env, userId: string) =>
  env.FOODIE_KV.get<Card[]>(`cards:${userId}`, 'json');

export const putCards = (env: Env, userId: string, cards: Card[]) =>
  env.FOODIE_KV.put(`cards:${userId}`, JSON.stringify(cards));

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
    for (const { name } of list.keys) {
      const sub = await env.FOODIE_KV.get<StoredPushSubscription>(name, 'json');
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
