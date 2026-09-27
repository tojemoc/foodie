import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rgbToHsv, estimateQuantity, recognizeProduce } from '../src/produce/recognize';
import { PRODUCE_CATALOG } from '../src/produce/catalog';

describe('produce recognition', () => {
  it('converts rgb to hsv', () => {
    const yellow = rgbToHsv(240, 220, 40);
    assert.ok(yellow.h > 40 && yellow.h < 70);
    assert.ok(yellow.s > 0.5);
  });

  it('ranks yellow produce from colour and resolves banana via label', async () => {
    const pixels = Array.from({ length: 40 }, () => ({ r: 230, g: 200, b: 40 }));
    const colourOnly = await recognizeProduce({ pixels, foregroundRatio: 0.7 });
    assert.ok(colourOnly.some((m) => ['banana', 'lemon', 'orange'].includes(m.entry.id)));

    const withLabel = await recognizeProduce({
      pixels,
      labels: ['banana'],
      foregroundRatio: 0.7,
    });
    assert.equal(withLabel[0].entry.id, 'banana');
    assert.ok(withLabel[0].quantity >= 1);
  });

  it('uses classifier aliases when provided', async () => {
    const pixels = [{ r: 10, g: 10, b: 10 }];
    const matches = await recognizeProduce({ pixels, labels: ['broccoli'] });
    assert.equal(matches[0].entry.id, 'broccoli');
    assert.equal(matches[0].reason, 'label:broccoli');
  });

  it('estimates quantity from foreground ratio', () => {
    const banana = PRODUCE_CATALOG.find((p) => p.id === 'banana')!;
    assert.equal(estimateQuantity(banana, 0), 1);
    assert.ok(estimateQuantity(banana, 1) >= banana.typicalQuantity);
  });
});
