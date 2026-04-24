import type { Card, Tombstone } from '../types.js';

/**
 * Merge local and remote state, respecting tombstones and updatedAt timestamps.
 *
 * Rules:
 *  1. Unify tombstone sets — a deletion always wins over any card version,
 *     regardless of timestamps.
 *  2. For cards that survive: Last-Write-Wins per card id, using `updatedAt`.
 *     This means whichever device edited a card most recently wins — making
 *     family/shared sync safe across multiple accounts writing to the same data.
 *  3. Cards that exist on only one side are kept as-is (offline additions
 *     from either device are preserved).
 */

export interface MergeResult {
  cards:      Card[];
  tombstones: Tombstone[];
}

export function mergeCards(
  localCards:       Card[],
  remoteCards:      Card[],
  localTombstones:  Tombstone[],
  remoteTombstones: Tombstone[],
): MergeResult {
  // ── Step 1: unify tombstones ───────────────────────────────────────────────
  // Keep earliest deletedAt per id (first deletion wins, prevents re-deletion races)
  const tombstoneMap = new Map<string, Tombstone>();
  for (const t of [...remoteTombstones, ...localTombstones]) {
    const existing = tombstoneMap.get(t.id);
    if (!existing || t.deletedAt < existing.deletedAt) {
      tombstoneMap.set(t.id, t);
    }
  }
  const tombstones = Array.from(tombstoneMap.values());
  const deletedIds = tombstoneMap; // same map used as a Set for O(1) lookup

  // ── Step 2: LWW merge by updatedAt ─────────────────────────────────────────
  const cardMap = new Map<string, Card>();

  // Seed with remote
  for (const card of remoteCards) {
    cardMap.set(card.id, card);
  }

  // Apply local — win if local is newer or remote doesn't have this card
  for (const card of localCards) {
    const remote = cardMap.get(card.id);
    if (!remote) {
      // Local-only addition — keep it
      cardMap.set(card.id, card);
    } else if (card.updatedAt > remote.updatedAt) {
      // Local edit is more recent — prefer it
      cardMap.set(card.id, card);
    }
    // else: remote is newer or equal — already in map, no-op
  }

  // ── Step 3: filter out tombstoned cards ────────────────────────────────────
  const cards = Array.from(cardMap.values()).filter(c => !deletedIds.has(c.id));

  return { cards, tombstones };
}
