import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daysUntilExpiry } from '../src/items/types.ts';

describe('daysUntilExpiry', () => {
  it('counts local calendar days across a spring DST transition', () => {
    // Europe/Bratislava DST spring forward is typically last Sunday of March.
    // From local midnight Mar 28 to Mar 29 is still 1 calendar day.
    const ref = new Date(2026, 2, 28, 12, 0, 0); // 2026-03-28 local
    assert.equal(daysUntilExpiry('2026-03-29', ref), 1);
    assert.equal(daysUntilExpiry('2026-03-28', ref), 0);
    assert.equal(daysUntilExpiry('2026-03-27', ref), -1);
  });
});
