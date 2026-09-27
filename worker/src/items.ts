import type { Env, Item, Tombstone } from './types.js';
import { jsonResponse }              from './lib/http.js';
import { verifyToken }               from './auth/jwt.js';
import {
  getItems         as kvGetItems,
  putItems         as kvPutItems,
  getTombstones    as kvGetTombstones,
  mergeTombstones,
  pruneTombstones,
} from './lib/kv.js';

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

  // One coalesced write for items + tombstones so rapid POSTs stay paired.
  const write = kvPutItems(env, userId, items, pruned);
  // Keep coalesced KV writes alive if the isolate would otherwise freeze after respond.
  ctx.waitUntil(write);
  await write;

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

