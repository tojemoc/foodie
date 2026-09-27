import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeItems } from '../src/items/merge';
import type { Item } from '../src/items/types';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'updatedAt'>): Item {
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

describe('mergeItems', () => {
  it('applies last-write-wins and tombstones', () => {
    const local = [item({ id: 'a', name: 'Local', updatedAt: '2026-01-02T00:00:00.000Z' })];
    const remote = [
      item({ id: 'a', name: 'Remote', updatedAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'b', name: 'Only remote', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const { items, tombstones } = mergeItems(
      local,
      remote,
      [{ id: 'b', deletedAt: '2026-01-03T00:00:00.000Z' }],
      [],
    );
    assert.equal(items.find((c) => c.id === 'a')?.name, 'Local');
    assert.equal(items.find((c) => c.id === 'b'), undefined);
    assert.equal(tombstones.length, 1);
  });
});
