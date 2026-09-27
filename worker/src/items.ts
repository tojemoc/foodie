import type { Env, Item, Tombstone } from './types.js';
import { jsonResponse }              from './lib/http.js';
import { verifyToken }               from './auth/jwt.js';
import {
  getItems      as kvGetItems,
  putItems      as kvPutItems,
  getTombstones as kvGetTombstones,
  putTombstones as kvPutTombstones,
} from './lib/kv.js';

const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function getItems(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const items      = await kvGetItems(env, userId)      ?? [];
  const tombstones = await kvGetTombstones(env, userId) ?? [];

  return jsonResponse({ items, tombstones }, 200, env);
}

export async function setItems(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const body = await request.json<{ items?: Item[]; cards?: Item[]; tombstones?: Tombstone[] }>();
  const items = Array.isArray(body.items) ? body.items : body.cards;
  if (!Array.isArray(items)) {
    return jsonResponse({ error: 'items must be an array' }, 400, env);
  }

  const existing = await kvGetTombstones(env, userId) ?? [];
  const incoming = body.tombstones ?? [];
  const merged   = mergeTombstones(existing, incoming);
  const pruned   = pruneTombstones(merged);

  const write = kvPutItems(env, userId, items);
  // Keep coalesced KV writes alive if the isolate would otherwise freeze after respond.
  ctx.waitUntil(write);
  await write;
  await kvPutTombstones(env, userId, pruned);

  return jsonResponse({ ok: true, count: items.length }, 200, env);
}

/** Legacy `/cards` GET — same data, old field name for older clients. */
export async function getCardsLegacy(request: Request, env: Env): Promise<Response> {
  const { userId, error } = await verifyToken(request, env);
  if (error || !userId) return jsonResponse({ error: error ?? 'Unauthorized' }, 401, env);

  const items      = await kvGetItems(env, userId)      ?? [];
  const tombstones = await kvGetTombstones(env, userId) ?? [];
  return jsonResponse({ cards: items, items, tombstones }, 200, env);
}

/** Legacy `/cards` POST — accepts `cards` or `items`. */
export async function setCardsLegacy(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  return setItems(request, env, ctx);
}

function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const map = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    const ex = map.get(t.id);
    if (!ex || t.deletedAt < ex.deletedAt) map.set(t.id, t);
  }
  return Array.from(map.values());
}

function pruneTombstones(tombstones: Tombstone[]): Tombstone[] {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  return tombstones.filter(t => new Date(t.deletedAt).getTime() > cutoff);
}
