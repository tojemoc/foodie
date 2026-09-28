import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Force a DST-observing zone so local midnight math crosses the spring-forward day.
process.env.TZ = 'Europe/Bratislava';

const { daysUntilExpiry } = await import('../src/items/types.ts');

describe('daysUntilExpiry', () => {
  it('counts local calendar days across a spring DST transition', () => {
    // Europe/Bratislava springs forward on 2026-03-29 (02:00 → 03:00).
    // Mar 29 local midnight → Mar 30 is a 23-hour civil day; calendar offset stays 1.
    const ref = new Date(2026, 2, 29, 12, 0, 0); // 2026-03-29 local
    assert.equal(daysUntilExpiry('2026-03-30', ref), 1);
    assert.equal(daysUntilExpiry('2026-03-29', ref), 0);
    assert.equal(daysUntilExpiry('2026-03-28', ref), -1);
  });
});
