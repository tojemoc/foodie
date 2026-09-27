import { fetchItems, pushItems } from '../api/client';
import { mergeItems } from './merge';
import {
  getItems,
  getTombstones,
  setItems,
  setTombstones,
} from './store';
import type { SyncStatus } from './types';

type StatusListener = (status: SyncStatus, message?: string) => void;
const statusListeners = new Set<StatusListener>();

export function onSyncStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function setStatus(status: SyncStatus, message?: string): void {
  for (const l of statusListeners) l(status, message);
}

export async function syncOnOpen(): Promise<void> {
  setStatus('syncing', 'Syncing…');
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

    const itemsChanged = JSON.stringify(items) !== JSON.stringify(remoteItems ?? []);
    const tombstonesChanged =
      JSON.stringify(tombstones) !== JSON.stringify(remoteTombstones ?? []);

    if (itemsChanged || tombstonesChanged) {
      await pushToRemote();
    } else {
      setStatus('synced', 'Synced');
    }
  } catch {
    setStatus('offline', 'Offline — local inventory');
  }
}

export async function pushToRemote(): Promise<void> {
  setStatus('syncing', 'Saving…');
  try {
    const { error } = await pushItems(getItems(), getTombstones());
    if (error) throw new Error(error);
    setStatus('synced', 'Synced');
  } catch {
    setStatus('error', 'Sync failed — changes kept locally');
  }
}
