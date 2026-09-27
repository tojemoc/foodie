import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item, Tombstone } from './types';

const STORE_KEY = 'foodie_v3_items';
const TOMBSTONE_KEY = 'foodie_v3_tombstones';
const LEGACY_STORE_KEY = 'foodie_v3_cards';
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let _items: Item[] = [];
let _tombstones: Tombstone[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

function pruneTombstones(): void {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  _tombstones = _tombstones.filter((t) => new Date(t.deletedAt).getTime() > cutoff);
}

export async function loadFromStorage(): Promise<Item[]> {
  try {
    const raw =
      (await AsyncStorage.getItem(STORE_KEY)) ??
      (await AsyncStorage.getItem(LEGACY_STORE_KEY));
    if (raw) _items = JSON.parse(raw) as Item[];
  } catch {
    _items = [];
  }
  try {
    const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
    if (raw) _tombstones = JSON.parse(raw) as Tombstone[];
    pruneTombstones();
    await persistTombstones();
  } catch {
    _tombstones = [];
  }
  notify();
  return _items;
}

async function persistItems(): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(_items));
}

async function persistTombstones(): Promise<void> {
  await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(_tombstones));
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
