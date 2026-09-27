import type { Item, Tombstone } from '../types.js';

const STORE_KEY     = 'foodie_v3_items';
const TOMBSTONE_KEY = 'foodie_v3_tombstones';
const LEGACY_STORE_KEY = 'foodie_v2_cards';
const LEGACY_TOMBSTONE_KEY = 'foodie_v2_tombstones';

const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let _items: Item[] = [];
let _tombstones: Tombstone[] = [];

export function getItems(): Item[] {
  return _items;
}

export function setItems(items: Item[]): void {
  _items = items;
  persistItems();
}

export function addItem(item: Item): void {
  _items = [item, ..._items];
  persistItems();
}

export function updateItem(updated: Item): void {
  _items = _items.map((c) => (c.id === updated.id ? updated : c));
  persistItems();
}

export function removeItem(id: string): void {
  _items = _items.filter((c) => c.id !== id);
  addTombstone(id);
  persistItems();
}

export function getTombstones(): Tombstone[] {
  return _tombstones;
}

export function setTombstones(tombstones: Tombstone[]): void {
  _tombstones = tombstones;
  persistTombstones();
}

function addTombstone(id: string): void {
  _tombstones = _tombstones.filter((t) => t.id !== id);
  _tombstones.push({ id, deletedAt: new Date().toISOString() });
  persistTombstones();
}

function pruneTombstones(): void {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  _tombstones = _tombstones.filter((t) => new Date(t.deletedAt).getTime() > cutoff);
}

export function loadFromLocalStorage(): Item[] {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(LEGACY_STORE_KEY);
    if (raw) _items = JSON.parse(raw) as Item[];
  } catch {
    _items = [];
  }

  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY) ?? localStorage.getItem(LEGACY_TOMBSTONE_KEY);
    if (raw) _tombstones = JSON.parse(raw) as Tombstone[];
    pruneTombstones();
    persistTombstones();
  } catch {
    _tombstones = [];
  }

  persistItems();
  return _items;
}

function persistItems(): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(_items));
}

function persistTombstones(): void {
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(_tombstones));
}

export function makeItem(partial: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>): Item {
  const now = new Date().toISOString();
  return { ...partial, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

export function touchItem(item: Item): Item {
  return { ...item, updatedAt: new Date().toISOString() };
}
