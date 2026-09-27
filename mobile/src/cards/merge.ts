import type { Card, Tombstone } from './types';

export interface MergeResult {
  cards: Card[];
  tombstones: Tombstone[];
}

/**
 * LWW merge with tombstones — identical rules to the PWA Worker client.
 */
export function mergeCards(
  localCards: Card[],
  remoteCards: Card[],
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

  const cardMap = new Map<string, Card>();
  for (const card of remoteCards) cardMap.set(card.id, card);
  for (const card of localCards) {
    const remote = cardMap.get(card.id);
    if (!remote || card.updatedAt > remote.updatedAt) {
      cardMap.set(card.id, card);
    }
  }

  const cards = Array.from(cardMap.values()).filter((c) => !tombstoneMap.has(c.id));
  return { cards, tombstones };
}
