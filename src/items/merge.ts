import type { Item, Tombstone } from '../types.js';

export interface MergeResult {
  items: Item[];
  tombstones: Tombstone[];
}

/**
 * Merge local and remote state, respecting tombstones and updatedAt timestamps.
 *
 * Rules:
 *  1. Unify tombstone sets — a deletion always wins over any item version,
 *     regardless of timestamps.
 *  2. For items that survive: Last-Write-Wins per item id, using `updatedAt`.
 *  3. Items that exist on only one side are kept as-is.
 */
export function mergeItems(
  localItems: Item[],
  remoteItems: Item[],
  localTombstones: Tombstone[],
  remoteTombstones: Tombstone[],
): MergeResult {
  const tombstoneMap = new Map<string, Tombstone>();
  for (const t of [...remoteTombstones, ...localTombstones]) {
    const existing = tombstoneMap.get(t.id);
    if (!existing || t.deletedAt < existing.deletedAt) {
      tombstoneMap.set(t.id, t);
    }
  }
  const tombstones = Array.from(tombstoneMap.values());

  const itemMap = new Map<string, Item>();
  for (const item of remoteItems) itemMap.set(item.id, item);
  for (const item of localItems) {
    const remote = itemMap.get(item.id);
    if (!remote || item.updatedAt > remote.updatedAt) {
      itemMap.set(item.id, item);
    }
  }

  const items = Array.from(itemMap.values()).filter((c) => !tombstoneMap.has(c.id));
  return { items, tombstones };
}
