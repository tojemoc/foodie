import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  parseFlexibleDate,
  parseInventoryCsv,
  parseLeadingQuantity,
  splitCsvRecords,
} from '../src/items/csvImport.ts';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/inventura-sample.csv');

describe('parseFlexibleDate', () => {
  it('parses D.M.YYYY and spaced variants', () => {
    assert.equal(parseFlexibleDate('6.6.2027'), '2027-06-06');
    assert.equal(parseFlexibleDate('31.12.2027'), '2027-12-31');
    assert.equal(parseFlexibleDate('28.6 2027'), '2027-06-28');
    assert.equal(parseFlexibleDate('1.4.2028'), '2028-04-01');
  });

  it('rejects impossible calendar dates', () => {
    assert.equal(parseFlexibleDate('2027-02-30'), null);
    assert.equal(parseFlexibleDate('31.2.2027'), null);
    assert.equal(parseFlexibleDate('2027-13-01'), null);
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
      'unknownloc item,,cellar,1.1.2028',
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

    const cellar = rows.find(r => r.name === 'unknownloc item');
    assert.equal(cellar?.placement, undefined);
  });

  it('keeps quoted fields that contain newlines as one record', () => {
    const csv = 'jedlo,koľko,miesto,dátum\n"line1\nline2",,pantry,1.2.2028\n';
    assert.equal(splitCsvRecords(csv).length, 2);
    const { rows } = parseInventoryCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, 'line1\nline2');
    assert.equal(rows[0]!.expiryDate, '2028-02-01');
  });

  it('treats bare CR as a record boundary and keeps CR inside quotes', () => {
    const csv = 'jedlo,koľko,miesto,dátum\r"a\rb",,pantry,1.2.2028\rc,\r\n';
    const records = splitCsvRecords(csv);
    assert.equal(records.length, 3);
    assert.equal(records[1], '"a\rb",,pantry,1.2.2028');
    const { rows } = parseInventoryCsv(csv);
    assert.equal(rows[0]!.name, 'a\rb');
  });

  it('keeps invalid ISO dates in notes without day-first salvage', () => {
    const csv = [
      'jedlo,koľko,miesto,dátum',
      'badiso,,,2027-02-30',
      'isosuffix,,,expires 2027-02-30',
      'noteonly,,,otvorený 20.9.2026',
    ].join('\n');
    const { rows } = parseInventoryCsv(csv);
    const bad = rows.find(r => r.name === 'badiso');
    assert.equal(bad?.expiryDate, undefined);
    assert.match(bad?.notes ?? '', /2027-02-30/);
    const suffix = rows.find(r => r.name === 'isosuffix');
    assert.equal(suffix?.expiryDate, undefined);
    assert.match(suffix?.notes ?? '', /2027-02-30/);
    const note = rows.find(r => r.name === 'noteonly');
    assert.equal(note?.expiryDate, '2026-09-20');
  });

  it('imports the repository inventúra fixture', () => {
    const text = readFileSync(fixturePath, 'utf8');
    const { rows } = parseInventoryCsv(text);
    assert.ok(rows.length >= 5);
    assert.ok(rows.some(r => r.name.toLowerCase().includes('oatly')));
    assert.ok(rows.some(r => r.name.includes('multiline')));
    assert.ok(rows.every(r => r.name.trim().length > 0));
  });
});
