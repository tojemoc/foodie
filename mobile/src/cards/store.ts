import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Card, Tombstone } from './types';

const STORE_KEY = 'foodie_v3_cards';
const TOMBSTONE_KEY = 'foodie_v3_tombstones';
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let _cards: Card[] = [];
let _tombstones: Tombstone[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCards(): Card[] {
  return _cards;
}

export function getTombstones(): Tombstone[] {
  return _tombstones;
}

export function setCards(cards: Card[]): void {
  _cards = cards;
  void persistCards();
  notify();
}

export function setTombstones(tombstones: Tombstone[]): void {
  _tombstones = tombstones;
  void persistTombstones();
}

export function addCard(card: Card): void {
  _cards = [card, ..._cards];
  void persistCards();
  notify();
}

export function updateCard(updated: Card): void {
  _cards = _cards.map((c) => (c.id === updated.id ? updated : c));
  void persistCards();
  notify();
}

export function removeCard(id: string): void {
  _cards = _cards.filter((c) => c.id !== id);
  addTombstone(id);
  void persistCards();
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

export async function loadFromStorage(): Promise<Card[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) _cards = JSON.parse(raw) as Card[];
  } catch {
    _cards = [];
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
  return _cards;
}

async function persistCards(): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(_cards));
}

async function persistTombstones(): Promise<void> {
  await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(_tombstones));
}

export function makeCard(
  partial: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>,
): Card {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchCard(card: Card): Card {
  return { ...card, updatedAt: new Date().toISOString() };
}
