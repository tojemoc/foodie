import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestExpiryDate,
  extractDates,
  fixOcrMistakes,
} from '../src/ocr/dateExtraction';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDaysFromNow(days: number): { y: number; m: number; d: number; iso: string; dmy: string; ymdCompact: string } {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dmy = `${pad(d)}.${pad(m)}.${y}`;
  const ymdCompact = `${y}${pad(m)}${pad(d)}`;
  return { y, m, d, iso, dmy, ymdCompact };
}

describe('fixOcrMistakes', () => {
  it('maps common OCR letter/digit confusions', () => {
    const { d, m, y } = isoDaysFromNow(60);
    const ocr = `EXP ${String(d).replace(/0/g, 'O')}.${String(m).replace(/0/g, 'O')}.${String(y).replace(/0/g, 'O')}`;
    // Force classic O↔0 confusions on a fixed-looking sample too
    assert.match(fixOcrMistakes('EXP 1O.O5.2O26'), /10\.05\.2026/);
    assert.match(fixOcrMistakes('USE BY 2O/O6/2O26'), /20\/06\/2026/);
    assert.ok(ocr.length > 0);
  });
});

describe('extractDates', () => {
  it('parses ISO and EU dotted dates near keywords', () => {
    const { iso, dmy } = isoDaysFromNow(45);
    const hits = extractDates(`MHD ${dmy} LOT 998`);
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].date, iso);
    assert.ok(hits[0].confidence > 0.4);
  });

  it('parses YYYYMMDD packed dates', () => {
    const { iso, ymdCompact } = isoDaysFromNow(90);
    const hits = extractDates(`EXP ${ymdCompact}`);
    assert.equal(bestExpiryDate(`EXP ${ymdCompact}`), iso);
    assert.equal(hits[0].pattern, 'YYYYMMDD');
  });

  it('parses MM/YY as end of month', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 14);
    const mm = pad(future.getMonth() + 1);
    const yy = String(future.getFullYear()).slice(-2);
    const hits = extractDates(`BEST BEFORE ${mm}/${yy}`);
    assert.ok(hits.some((h) => h.date.startsWith(`${future.getFullYear()}-${mm}-`)));
  });

  it('parses DD MMM YYYY', () => {
    const { y, m, d, iso } = isoDaysFromNow(120);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const label = `Use by ${pad(d)} ${months[m - 1]} ${y}`;
    assert.equal(bestExpiryDate(label), iso);
  });

  it('parses unambiguous US MM/DD/YYYY when day > 12', () => {
    const base = isoDaysFromNow(200);
    // Force an unambiguous US date (day > 12)
    const y = base.y;
    const mo = Math.min(12, Math.max(1, base.m));
    const day = 25;
    const hits = extractDates(`EXP ${pad(mo)}/${pad(day)}/${y}`);
    assert.ok(hits.some((h) => h.date === `${y}-${pad(mo)}-${pad(day)}`));
  });

  it('prefers dates near expiry keywords over lot noise', () => {
    const lot = isoDaysFromNow(30);
    const best = isoDaysFromNow(60);
    const hits = extractDates(
      `LOT ${pad(lot.d)}/${pad(lot.m)}/${lot.y}  BEST BEFORE ${pad(best.d)}/${pad(best.m)}/${best.y}`,
    );
    assert.equal(hits[0].date, best.iso);
  });

  it('handles OCR O/I substitutions in dates', () => {
    const { d, m, y, iso } = isoDaysFromNow(40);
    const ocr = `EXP ${pad(d).replace(/0/g, 'O')}/${pad(m).replace(/0/g, 'O')}/${String(y).replace(/0/g, 'O')}`;
    assert.equal(bestExpiryDate(ocr), iso);
  });

  it('skips shorter MM/YYYY spans contained in a full date', () => {
    const { d, m, y, iso } = isoDaysFromNow(50);
    const hits = extractDates(`BEST BEFORE ${pad(d)}/${pad(m)}/${y}`);
    assert.ok(hits.some((h) => h.date === iso && h.pattern.includes('YYYY')));
    assert.ok(!hits.some((h) => h.pattern === 'MM/YYYY' || h.pattern === 'YYYY/MM'));
  });
});
