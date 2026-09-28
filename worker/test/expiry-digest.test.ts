import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterExpiringSoon, localClock } from '../src/scheduled/expiry-digest.ts';
import type { Item } from '../src/types.ts';

function item(partial: Partial<Item> & { name: string; expiryDate: string }): Item {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name,
    number: '',
    format: 'MANUAL',
    category: 'grocery',
    notes: '',
    expiryDate: partial.expiryDate,
    placement: partial.placement ?? 'pantry',
    color: '#000',
    emoji: '🥗',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('filterExpiringSoon', () => {
  it('includes items within the next 7 local calendar days', () => {
    const today = '2026-09-28';
    const rows = filterExpiringSoon(
      [
        item({ name: 'today', expiryDate: '2026-09-28' }),
        item({ name: 'week', expiryDate: '2026-10-04' }),
        item({ name: 'later', expiryDate: '2026-10-05' }),
        item({ name: 'past', expiryDate: '2026-09-27' }),
      ],
      today,
    );
    assert.deepEqual(
      rows.map(r => r.name),
      ['today', 'week'],
    );
  });
});

describe('localClock', () => {
  it('resolves Europe/Bratislava hour and date', () => {
    // 2026-09-28 06:30 UTC = 08:30 CEST (UTC+2)
    const clock = localClock(new Date('2026-09-28T06:30:00.000Z'), 'Europe/Bratislava');
    assert.equal(clock.hour, 8);
    assert.equal(clock.date, '2026-09-28');
  });
});
