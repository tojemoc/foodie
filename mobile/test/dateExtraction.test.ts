import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestExpiryDate,
  extractDates,
  fixOcrMistakes,
} from '../src/ocr/dateExtraction';

describe('fixOcrMistakes', () => {
  it('maps common OCR letter/digit confusions', () => {
    assert.match(fixOcrMistakes('EXP 1O.O5.2O26'), /10\.05\.2026/);
    assert.match(fixOcrMistakes('USE BY 2O/O6/2O26'), /20\/06\/2026/);
  });
});

describe('extractDates', () => {
  it('parses ISO and EU dotted dates near keywords', () => {
    const hits = extractDates('MHD 15.04.2026 LOT 998');
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].date, '2026-04-15');
    assert.ok(hits[0].confidence > 0.4);
  });

  it('parses YYYYMMDD packed dates', () => {
    const hits = extractDates('EXP 20260831');
    assert.equal(bestExpiryDate('EXP 20260831'), '2026-08-31');
    assert.equal(hits[0].pattern, 'YYYYMMDD');
  });

  it('parses MM/YY as end of month', () => {
    const hits = extractDates('BEST BEFORE 08/27');
    assert.ok(hits.some((h) => h.date.startsWith('2027-08-')));
  });

  it('parses DD MMM YYYY', () => {
    assert.equal(bestExpiryDate('Use by 03 JAN 2027'), '2027-01-03');
  });

  it('parses unambiguous US MM/DD/YYYY when day > 12', () => {
    const hits = extractDates('EXP 03/25/2026');
    assert.ok(hits.some((h) => h.date === '2026-03-25'));
  });

  it('prefers dates near expiry keywords over lot noise', () => {
    const hits = extractDates('LOT 12/05/2026  BEST BEFORE 20/06/2026');
    assert.equal(hits[0].date, '2026-06-20');
  });

  it('handles OCR O/I substitutions in dates', () => {
    assert.equal(bestExpiryDate('EXP 2O/O6/2O26'), '2026-06-20');
  });
});
