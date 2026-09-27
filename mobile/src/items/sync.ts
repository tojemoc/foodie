import { fetchItems, pushItems } from '../api/client';
import { mergeItems } from './merge';
import {
  getItems,
  getStorageGeneration,
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
  const gen = getStorageGeneration();
  setStatus('syncing', 'Syncing…');
  try {
    const { items: remoteItems, tombstones: remoteTombstones, error } = await fetchItems();
    if (error) throw new Error(error);
    if (gen !== getStorageGeneration()) return;

    const { items, tombstones } = mergeItems(
      getItems(),
      remoteItems ?? [],
      getTombstones(),
      remoteTombstones ?? [],
    );

    if (gen !== getStorageGeneration()) return;

    setItems(items);
    setTombstones(tombstones);

    const itemsChanged = JSON.stringify(items) !== JSON.stringify(remoteItems ?? []);
    const tombstonesChanged =
      JSON.stringify(tombstones) !== JSON.stringify(remoteTombstones ?? []);

    if (itemsChanged || tombstonesChanged) {
      await pushToRemote(gen);
    } else if (gen === getStorageGeneration()) {
      setStatus('synced', 'Synced');
    }
  } catch {
    if (gen === getStorageGeneration()) {
      setStatus('offline', 'Offline — local inventory');
    }
  }
}

export async function pushToRemote(expectedGen?: number): Promise<void> {
  const gen = expectedGen ?? getStorageGeneration();
  if (gen !== getStorageGeneration()) return;

  setStatus('syncing', 'Saving…');
  try {
    const items = getItems();
    const tombstones = getTombstones();
    if (gen !== getStorageGeneration()) return;

    const { error } = await pushItems(items, tombstones);
    if (error) throw new Error(error);
    if (gen === getStorageGeneration()) setStatus('synced', 'Synced');
  } catch {
    if (gen === getStorageGeneration()) {
      setStatus('error', 'Sync failed — changes kept locally');
    }
  }
}
