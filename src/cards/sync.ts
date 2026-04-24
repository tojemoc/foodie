import { fetchCards, pushCards }            from '../api.js';
import { getCards, setCards, getTombstones, setTombstones } from './store.js';
import { mergeCards }                       from './merge.js';
import { setSyncState }                     from '../ui/toast.js';
import { renderCards }                      from '../ui/cards.js';

/**
 * Pull remote state, merge with local (tombstones included), push merged
 * state back only if something actually changed, then re-render.
 *
 * Typical flow per sync:
 *   1. GET /cards  — fetch remote cards + tombstones
 *   2. POST /cards — push merged state back (skipped if nothing changed)
 *
 * The POST is skipped when the remote was already up to date, cutting the
 * sync down to a single request in the common "open app, already in sync" case.
 */
export async function syncOnOpen(): Promise<void> {
  setSyncState('syncing', 'Syncing…');
  try {
    const { cards: remoteCards, tombstones: remoteTombstones, error } = await fetchCards();
    if (error) throw new Error(error);

    const localCards      = getCards();
    const localTombstones = getTombstones();

    const { cards, tombstones } = mergeCards(
      localCards,
      remoteCards      ?? [],
      localTombstones,
      remoteTombstones ?? [],
    );

    setCards(cards);
    setTombstones(tombstones);
    renderCards();

    // Only push back if the merge actually produced a change.
    // Compare by serialising — cheap enough for typical card counts.
    const cardsChanged      = JSON.stringify(cards)      !== JSON.stringify(remoteCards ?? []);
    const tombstonesChanged = JSON.stringify(tombstones) !== JSON.stringify(remoteTombstones ?? []);

    if (cardsChanged || tombstonesChanged) {
      await pushToRemote();
    } else {
      setSyncState('synced', 'Synced');
    }
  } catch {
    setSyncState('error', 'Offline');
  }
}

/**
 * Push current local cards + tombstones to the server.
 * Called after every card add / edit / delete.
 */
export async function pushToRemote(): Promise<void> {
  setSyncState('syncing', 'Saving…');
  try {
    const { error } = await pushCards(getCards(), getTombstones());
    if (error) throw new Error(error);
    setSyncState('synced', 'Synced');
  } catch {
    setSyncState('error', 'Sync failed');
  }
}
