import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item, Tombstone } from './types';

const ANON_ITEMS_KEY = 'foodie_v3_items:anon';
const ANON_TOMBSTONE_KEY = 'foodie_v3_tombstones:anon';
/** Pre-namespace keys — migrated into the anonymous namespace once. */
const LEGACY_ITEMS_KEY = 'foodie_v3_items';
const LEGACY_CARDS_KEY = 'foodie_v3_cards';
const LEGACY_TOMBSTONE_KEY = 'foodie_v3_tombstones';
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type StorageNamespace =
  | { kind: 'anonymous' }
  | { kind: 'account'; userId: string };

let _namespace: StorageNamespace = { kind: 'anonymous' };
/** Bumped on every namespace switch; async load/sync discard stale generations. */
let _generation = 0;
let _items: Item[] = [];
let _tombstones: Tombstone[] = [];
const listeners = new Set<() => void>();

function itemsKey(ns: StorageNamespace): string {
  return ns.kind === 'anonymous' ? ANON_ITEMS_KEY : `foodie_v3_items:user:${ns.userId}`;
}

function tombstoneKey(ns: StorageNamespace): string {
  return ns.kind === 'anonymous'
    ? ANON_TOMBSTONE_KEY
    : `foodie_v3_tombstones:user:${ns.userId}`;
}

function notify(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStorageNamespace(): StorageNamespace {
  return _namespace;
}

export function getStorageGeneration(): number {
  return _generation;
}

/**
 * Switch the active local inventory namespace.
 * Does not merge data between namespaces — call loadFromStorage() after.
 */
export async function selectStorageNamespace(ns: StorageNamespace): Promise<void> {
  _namespace = ns;
  _items = [];
  _tombstones = [];
  _generation += 1;
}

export function getItems(): Item[] {
  return _items;
}

export function getTombstones(): Tombstone[] {
  return _tombstones;
}

export function setItems(items: Item[]): void {
  _items = items;
  void persistItems();
  notify();
}

export function setTombstones(tombstones: Tombstone[]): void {
  _tombstones = tombstones;
  void persistTombstones();
}

export function addItem(item: Item): void {
  _items = [item, ..._items];
  void persistItems();
  notify();
}

export function updateItem(updated: Item): void {
  _items = _items.map((c) => (c.id === updated.id ? updated : c));
  void persistItems();
  notify();
}

export function removeItem(id: string): void {
  _items = _items.filter((c) => c.id !== id);
  addTombstone(id);
  void persistItems();
  notify();
}

function addTombstone(id: string): void {
  _tombstones = _tombstones.filter((t) => t.id !== id);
  _tombstones.push({ id, deletedAt: new Date().toISOString() });
  void persistTombstones();
}

export async function loadFromStorage(): Promise<Item[]> {
  const gen = _generation;
  const ns = _namespace;
  const iKey = itemsKey(ns);
  const tKey = tombstoneKey(ns);

  let nextItems: Item[] = [];
  let nextTombstones: Tombstone[] = [];

  try {
    let raw = await AsyncStorage.getItem(iKey);
    // One-time migration of pre-namespace inventory into the anonymous namespace.
    if (!raw && ns.kind === 'anonymous') {
      raw =
        (await AsyncStorage.getItem(LEGACY_ITEMS_KEY)) ??
        (await AsyncStorage.getItem(LEGACY_CARDS_KEY));
      if (raw) {
        await AsyncStorage.setItem(iKey, raw);
        await AsyncStorage.multiRemove([LEGACY_ITEMS_KEY, LEGACY_CARDS_KEY]);
      }
    }
    if (raw) nextItems = JSON.parse(raw) as Item[];
  } catch {
    nextItems = [];
  }

  try {
    let raw = await AsyncStorage.getItem(tKey);
    if (!raw && ns.kind === 'anonymous') {
      raw = await AsyncStorage.getItem(LEGACY_TOMBSTONE_KEY);
      if (raw) {
        await AsyncStorage.setItem(tKey, raw);
        await AsyncStorage.removeItem(LEGACY_TOMBSTONE_KEY);
      }
    }
    if (raw) nextTombstones = JSON.parse(raw) as Tombstone[];
    const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
    nextTombstones = nextTombstones.filter(
      (t) => new Date(t.deletedAt).getTime() > cutoff,
    );
  } catch {
    nextTombstones = [];
  }

  if (gen !== _generation) return _items;

  _items = nextItems;
  _tombstones = nextTombstones;
  await AsyncStorage.setItem(tKey, JSON.stringify(_tombstones));
  notify();
  return _items;
}

async function persistItems(): Promise<void> {
  const key = itemsKey(_namespace);
  const payload = JSON.stringify(_items);
  await AsyncStorage.setItem(key, payload);
}

async function persistTombstones(): Promise<void> {
  const key = tombstoneKey(_namespace);
  const payload = JSON.stringify(_tombstones);
  await AsyncStorage.setItem(key, payload);
}

export function makeItem(
  partial: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>,
): Item {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchItem(item: Item): Item {
  return { ...item, updatedAt: new Date().toISOString() };
}
