import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeCards } from '../src/cards/merge';
import type { Card } from '../src/cards/types';

function card(partial: Partial<Card> & Pick<Card, 'id' | 'updatedAt'>): Card {
  return {
    name: 'x',
    number: '',
    format: 'NONE',
    category: 'grocery',
    notes: '',
    color: '#000',
    emoji: '🍎',
    createdAt: partial.updatedAt,
    ...partial,
  };
}

describe('mergeCards', () => {
  it('applies last-write-wins and tombstones', () => {
    const local = [card({ id: 'a', name: 'Local', updatedAt: '2026-01-02T00:00:00.000Z' })];
    const remote = [card({ id: 'a', name: 'Remote', updatedAt: '2026-01-01T00:00:00.000Z' }), card({ id: 'b', name: 'Only remote', updatedAt: '2026-01-01T00:00:00.000Z' })];
    const { cards, tombstones } = mergeCards(
      local,
      remote,
      [{ id: 'b', deletedAt: '2026-01-03T00:00:00.000Z' }],
      [],
    );
    assert.equal(cards.find((c) => c.id === 'a')?.name, 'Local');
    assert.equal(cards.find((c) => c.id === 'b'), undefined);
    assert.equal(tombstones.length, 1);
  });
});
