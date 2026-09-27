import { fetchItems, pushItems } from '../api.js';
import { getItems, setItems, getTombstones, setTombstones } from './store.js';
import { mergeItems } from './merge.js';
import { setSyncState } from '../ui/toast.js';
import { renderItems } from '../ui/items.js';

/**
 * Pull remote state, merge with local (tombstones included), push merged
 * state back only if something actually changed, then re-render.
 *
 * Typical flow per sync:
 *   1. GET /items  — fetch remote items + tombstones
 *   2. POST /items — push merged state back (skipped if nothing changed)
 */
export async function syncOnOpen(): Promise<void> {
  setSyncState('syncing', 'Syncing…');
  try {
    const { items: remoteItems, tombstones: remoteTombstones, error } = await fetchItems();
    if (error) throw new Error(error);

    const { items, tombstones } = mergeItems(
      getItems(),
      remoteItems ?? [],
      getTombstones(),
      remoteTombstones ?? [],
    );

    setItems(items);
    setTombstones(tombstones);
    renderItems();

    const itemsChanged = JSON.stringify(items) !== JSON.stringify(remoteItems ?? []);
    const tombstonesChanged =
      JSON.stringify(tombstones) !== JSON.stringify(remoteTombstones ?? []);

    if (itemsChanged || tombstonesChanged) {
      await pushToRemote();
    } else {
      setSyncState('synced', 'Synced');
    }
  } catch {
    setSyncState('error', 'Offline');
  }
}

export async function pushToRemote(): Promise<void> {
  setSyncState('syncing', 'Saving…');
  try {
    const { error } = await pushItems(getItems(), getTombstones());
    if (error) throw new Error(error);
    setSyncState('synced', 'Synced');
  } catch {
    setSyncState('error', 'Sync failed');
  }
}
