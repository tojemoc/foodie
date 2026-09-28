import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  parseFlexibleDate,
  parseInventoryCsv,
  parseLeadingQuantity,
} from '../src/items/csvImport.ts';

describe('parseFlexibleDate', () => {
  it('parses D.M.YYYY and spaced variants', () => {
    assert.equal(parseFlexibleDate('6.6.2027'), '2027-06-06');
    assert.equal(parseFlexibleDate('31.12.2027'), '2027-12-31');
    assert.equal(parseFlexibleDate('28.6 2027'), '2027-06-28');
    assert.equal(parseFlexibleDate('1.4.2028'), '2028-04-01');
  });
});

describe('parseLeadingQuantity', () => {
  it('extracts Nx prefixes and keeps bare names', () => {
    assert.deepEqual(parseLeadingQuantity('2x oatly'), { name: 'oatly', quantity: 2 });
    assert.deepEqual(parseLeadingQuantity('0x slaný popcorn'), { name: 'slaný popcorn', quantity: 0 });
    assert.deepEqual(parseLeadingQuantity('soľ'), { name: 'soľ' });
  });
});

describe('parseInventoryCsv', () => {
  it('parses inventúra sample rows', () => {
    const csv = [
      'jedlo,koľko,miesto,dátum',
      '2x oatly,1 l,pantry,6.6.2027',
      '0x bezlaktózové mlieko,1 l,pantry,',
      'zavarané uhorky,,pantry,31.12.2027',
      ',,,',
      'starkin džem,,,otvorený 20.9.2026',
      'mrazený hrášok,,,20.10.2027',
    ].join('\n');

    const { rows, skipped } = parseInventoryCsv(csv);
    assert.equal(skipped >= 2, true); // empty + 0x
    const oatly = rows.find(r => r.name === 'oatly');
    assert.ok(oatly);
    assert.equal(oatly!.quantity, 2);
    assert.equal(oatly!.placement, 'pantry');
    assert.equal(oatly!.expiryDate, '2027-06-06');

    const pickles = rows.find(r => r.name === 'zavarané uhorky');
    assert.equal(pickles?.expiryDate, '2027-12-31');

    const jam = rows.find(r => r.name === 'starkin džem');
    assert.equal(jam?.expiryDate, '2026-09-20');
    assert.match(jam?.notes ?? '', /otvorený/);

    const peas = rows.find(r => r.name === 'mrazený hrášok');
    assert.equal(peas?.placement, 'freezer');
  });

  it('imports the uploaded inventory CSV with many pantry rows', () => {
    const path =
      '/home/ubuntu/.cursor/projects/workspace/uploads/Z_soby_na_byte_-_Invent_ra_-_Inventory_2b3b.csv';
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      // Artifact path may be absent in CI — skip soft.
      return;
    }
    const { rows } = parseInventoryCsv(text);
    assert.ok(rows.length > 40);
    assert.ok(rows.some(r => r.name.toLowerCase().includes('oatly')));
    assert.ok(rows.every(r => r.name.trim().length > 0));
  });
});
