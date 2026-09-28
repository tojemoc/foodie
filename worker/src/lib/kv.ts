import type { Env, User, Credential, ChallengeData, MagicLinkData, Item, Tombstone, UserPrefs } from '../types.js';

// ── User ─────────────────────────────────────────────────────────────────────

export const getUser = (env: Env, userId: string) =>
  env.FOODIE_KV.get<User>(`user:${userId}`, 'json');

export const putUser = (env: Env, user: User) =>
  env.FOODIE_KV.put(`user:${user.id}`, JSON.stringify(user));

export const getUserIdByEmail = (env: Env, email: string) =>
  env.FOODIE_KV.get(`email:${email}`);

export const putEmailIndex = (env: Env, email: string, userId: string) =>
  env.FOODIE_KV.put(`email:${email}`, userId);

// ── Notification / digest prefs ───────────────────────────────────────────────

export const DEFAULT_DIGEST_TIMEZONE = 'Europe/Bratislava';

export function defaultUserPrefs(): UserPrefs {
  return {
    emailDigest: false,
    timezone: DEFAULT_DIGEST_TIMEZONE,
    updatedAt: new Date().toISOString(),
  };
}

export async function getUserPrefs(env: Env, userId: string): Promise<UserPrefs> {
  const stored = await env.FOODIE_KV.get<UserPrefs>(`prefs:${userId}`, 'json');
  if (!stored) return defaultUserPrefs();
  return {
    emailDigest: !!stored.emailDigest,
    timezone: stored.timezone?.trim() || DEFAULT_DIGEST_TIMEZONE,
    lastDigestLocalDate: stored.lastDigestLocalDate,
    updatedAt: stored.updatedAt || new Date().toISOString(),
  };
}

export async function putUserPrefs(env: Env, userId: string, prefs: UserPrefs): Promise<void> {
  await env.FOODIE_KV.put(`prefs:${userId}`, JSON.stringify(prefs));
}

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

const MAGIC_TTL_SEC = 900;

export async function putMagicLink(env: Env, data: MagicLinkData): Promise<void> {
  const body = JSON.stringify(data);
  await Promise.all([
    env.FOODIE_KV.put(`magiclink:${data.token}`, body, { expirationTtl: MAGIC_TTL_SEC }),
    env.FOODIE_KV.put(`magiccode:${data.code}`, body, { expirationTtl: MAGIC_TTL_SEC }),
  ]);
}

/** Consume by long token or 6-digit passcode; clears both indexes. */
export async function getAndDeleteMagicLink(
  env:   Env,
  tokenOrCode: string,
): Promise<MagicLinkData | null> {
  const raw = tokenOrCode.trim();
  if (!raw) return null;

  const isCode = /^\d{6}$/.test(raw);
  const primaryKey = isCode ? `magiccode:${raw}` : `magiclink:${raw}`;
  const data = await env.FOODIE_KV.get<MagicLinkData>(primaryKey, 'json');
  if (!data) return null;

  const token = data.token || (!isCode ? raw : '');
  const code  = data.code || (isCode ? raw : '');
  await Promise.all([
    token ? env.FOODIE_KV.delete(`magiclink:${token}`) : Promise.resolve(),
    code  ? env.FOODIE_KV.delete(`magiccode:${code}`)  : Promise.resolve(),
    // Always clear the key we read in case of legacy records without token/code fields.
    env.FOODIE_KV.delete(primaryKey),
  ]);
  return data;
}

// ── Items (legacy KV key `cards:` still read for migration) ───────────────────

export async function getItems(env: Env, userId: string): Promise<Item[] | null> {
  const modern = await env.FOODIE_KV.get<Item[]>(`items:${userId}`, 'json');
  if (modern) return modern;
  return env.FOODIE_KV.get<Item[]>(`cards:${userId}`, 'json');
}

const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Merge by earliest deletedAt (same rule as item POST handlers). */
export function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const map = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    const ex = map.get(t.id);
    if (!ex || t.deletedAt < ex.deletedAt) map.set(t.id, t);
  }
  return Array.from(map.values());
}

export function pruneTombstones(tombstones: Tombstone[]): Tombstone[] {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  return tombstones.filter(t => new Date(t.deletedAt).getTime() > cutoff);
}

/**
 * Per-isolate write coalescer — rapid saves keep only the latest payload.
 * Items and tombstones share one queue so a POST’s pair stays in sync when
 * later requests coalesce over it.
 */
type PendingWrite = {
  env: Env;
  items?: Item[];
  tombstones?: Tombstone[];
  /**
   * When true, flush re-reads KV and merges queued tombstones (putItems path).
   * When false, write the exact latest list (putTombstones), even if coalesced
   * onto an item batch.
   */
  mergeTombstonesOnFlush?: boolean;
  waiters: Array<{ resolve: () => void; reject: (err: unknown) => void }>;
};
const pendingWrites = new Map<string, PendingWrite>();
const flushing = new Set<string>();

function enqueueWrite(
  userId: string,
  patch: {
    env: Env;
    items?: Item[];
    tombstones?: Tombstone[];
    mergeTombstonesOnFlush?: boolean;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = pendingWrites.get(userId);
    if (existing) {
      existing.env = patch.env;
      if (patch.items !== undefined) existing.items = patch.items;
      if (patch.tombstones !== undefined) {
        existing.tombstones = patch.tombstones;
        // Last tombstone writer wins exact-vs-merge semantics.
        existing.mergeTombstonesOnFlush = patch.mergeTombstonesOnFlush;
      }
      existing.waiters.push({ resolve, reject });
    } else {
      pendingWrites.set(userId, {
        env: patch.env,
        items: patch.items,
        tombstones: patch.tombstones,
        mergeTombstonesOnFlush: patch.mergeTombstonesOnFlush,
        waiters: [{ resolve, reject }],
      });
    }
    void flushInventoryWrites(userId);
  });
}

export function putItems(
  env: Env,
  userId: string,
  items: Item[],
  tombstones?: Tombstone[],
): Promise<void> {
  return enqueueWrite(userId, {
    env,
    items,
    tombstones,
    // Item batches re-merge against KV on flush so coalesced POSTs cannot drop deletes.
    mergeTombstonesOnFlush: tombstones !== undefined ? true : undefined,
  });
}

async function flushInventoryWrites(userId: string): Promise<void> {
  if (flushing.has(userId)) return;
  flushing.add(userId);
  try {
    while (pendingWrites.has(userId)) {
      const batch = pendingWrites.get(userId)!;
      pendingWrites.delete(userId);
      try {
        if (batch.items !== undefined) {
          await batch.env.FOODIE_KV.put(`items:${userId}`, JSON.stringify(batch.items));
          // Drop legacy key after a successful write so digests/clients converge.
          await batch.env.FOODIE_KV.delete(`cards:${userId}`);
        }
        if (batch.tombstones !== undefined) {
          let toWrite = batch.tombstones;
          if (batch.mergeTombstonesOnFlush) {
            const stored =
              (await batch.env.FOODIE_KV.get<Tombstone[]>(`tombstones:${userId}`, 'json')) ?? [];
            toWrite = pruneTombstones(mergeTombstones(stored, batch.tombstones));
          }
          await batch.env.FOODIE_KV.put(
            `tombstones:${userId}`,
            JSON.stringify(toWrite),
          );
        }
        for (const w of batch.waiters) w.resolve();
      } catch (err) {
        for (const w of batch.waiters) w.reject(err);
      }
    }
  } finally {
    flushing.delete(userId);
  }
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

/** Coalesced like putItems — writes the exact latest list (no KV re-merge). */
export function putTombstones(
  env: Env,
  userId: string,
  tombstones: Tombstone[],
): Promise<void> {
  return enqueueWrite(userId, {
    env,
    tombstones,
    mergeTombstonesOnFlush: false,
  });
}

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
