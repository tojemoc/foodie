import { fetchCards, pushCards } from '../api/client';
import { mergeCards } from './merge';
import {
  getCards,
  getTombstones,
  setCards,
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
    const { cards: remoteCards, tombstones: remoteTombstones, error } = await fetchCards();
    if (error) throw new Error(error);

    const { cards, tombstones } = mergeCards(
      getCards(),
      remoteCards ?? [],
      getTombstones(),
      remoteTombstones ?? [],
    );

    setCards(cards);
    setTombstones(tombstones);

    const cardsChanged = JSON.stringify(cards) !== JSON.stringify(remoteCards ?? []);
    const tombstonesChanged =
      JSON.stringify(tombstones) !== JSON.stringify(remoteTombstones ?? []);

    if (cardsChanged || tombstonesChanged) {
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
    const { error } = await pushCards(getCards(), getTombstones());
    if (error) throw new Error(error);
    setStatus('synced', 'Synced');
  } catch {
    setStatus('error', 'Sync failed — changes kept locally');
  }
}
