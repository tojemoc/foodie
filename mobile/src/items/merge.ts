import type { Item, Tombstone } from './types';

export interface MergeResult {
  items: Item[];
  tombstones: Tombstone[];
}

/** LWW merge with tombstones — identical rules to the Worker / PWA client. */
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
