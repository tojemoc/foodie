import type { DateExtractionResult } from '../types';

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function fixOcrMistakes(text: string): string {
  return text
    .toUpperCase()
    .replace(/O(?=\d)/g, '0')
    .replace(/(?<=\d)O/g, '0')
    .replace(/I(?=\d)/g, '1')
    .replace(/(?<=\d)I/g, '1')
    .replace(/S(?=\d)/g, '5')
    .replace(/(?<=\d)S/g, '5');
}

function isReasonableDate(d: Date): boolean {
  const now = new Date();
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  const tenYearsLater = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
  return d >= fiveYearsAgo && d <= tenYearsLater;
}

function roundTripValid(d: Date, expectedYear: number, expectedMonth: number, expectedDay: number): boolean {
  return d.getFullYear() === expectedYear && d.getMonth() === expectedMonth && d.getDate() === expectedDay;
}

function nearKeyword(text: string, matchIndex: number): boolean {
  const keywords = ['EXP', 'BEST', 'BEFORE', 'USE BY', 'BB', 'VERBRAUCH', 'MHD', 'THT'];
  const window = text.substring(Math.max(0, matchIndex - 30), matchIndex + 5).toUpperCase();
  return keywords.some((k) => window.includes(k));
}

interface RawMatch {
  date: Date;
  pattern: string;
  index: number;
}

function parseAllDates(cleaned: string): RawMatch[] {
  const results: RawMatch[] = [];

  const patterns: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => Date | null; name: string }> = [
    {
      name: 'YYYY-MM-DD',
      re: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
      parse: (m) => {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return roundTripValid(d, +m[1], +m[2] - 1, +m[3]) ? d : null;
      },
    },
    {
      name: 'DD/MM/YYYY',
      re: /\b(\d{2})[./-](\d{2})[./-](\d{4})\b/g,
      parse: (m) => {
        const d = new Date(+m[3], +m[2] - 1, +m[1]);
        return roundTripValid(d, +m[3], +m[2] - 1, +m[1]) ? d : null;
      },
    },
    {
      name: 'DD/MM/YY',
      re: /\b(\d{2})[./-](\d{2})[./-](\d{2})\b/g,
      parse: (m) => {
        const yr = +m[3] + (+m[3] < 70 ? 2000 : 1900);
        const d = new Date(yr, +m[2] - 1, +m[1]);
        return roundTripValid(d, yr, +m[2] - 1, +m[1]) ? d : null;
      },
    },
    {
      name: 'MM/YY',
      re: /\b(\d{2})[/-](\d{2})\b/g,
      parse: (m) => {
        const yr = +m[2] + (+m[2] < 70 ? 2000 : 1900);
        const month = +m[1] - 1;
        if (month < 0 || month > 11) return null;
        const d = new Date(yr, month + 1, 0);
        if (d.getFullYear() !== yr || d.getMonth() !== month) return null;
        return d;
      },
    },
    {
      name: 'DD MMM YYYY',
      re: /\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{2,4})\b/g,
      parse: (m) => {
        const yr = m[3].length === 2 ? +m[3] + 2000 : +m[3];
        const mo = MONTHS[m[2]];
        const d = new Date(yr, mo, +m[1]);
        return roundTripValid(d, yr, mo, +m[1]) ? d : null;
      },
    },
    {
      name: 'DD MMM',
      re: /\b(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g,
      parse: (m) => {
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const mo = MONTHS[m[2]];
        let d = new Date(now.getFullYear(), mo, +m[1]);
        if (!roundTripValid(d, now.getFullYear(), mo, +m[1])) return null;
        if (d < todayMidnight) {
          d = new Date(now.getFullYear() + 1, mo, +m[1]);
          if (!roundTripValid(d, now.getFullYear() + 1, mo, +m[1])) return null;
        }
        return d;
      },
    },
  ];

  for (const { re, parse, name } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      const d = parse(m);
      if (d && !isNaN(d.getTime()) && isReasonableDate(d)) {
        results.push({ date: d, pattern: name, index: m.index });
      }
    }
  }

  return results;
}

function scoreDateCandidate(match: RawMatch, text: string): number {
  let score = 0;

  if (match.pattern.includes('YYYY') || match.pattern.includes('DD MMM YYYY')) {
    score += 0.4;
  } else {
    score += 0.2;
  }

  if (nearKeyword(text, match.index)) {
    score += 0.3;
  }

  const now = new Date();
  if (match.date > now) {
    score += 0.2;
  }

  const line = text.substring(Math.max(0, match.index - 10), match.index + 20).toUpperCase();
  if (line.includes('LOT') || line.includes('BATCH') || line.includes(':')) {
    score -= 0.3;
  }

  return Math.max(0, Math.min(1, score));
}

export function extractDates(rawText: string): DateExtractionResult[] {
  const cleaned = fixOcrMistakes(rawText);
  const matches = parseAllDates(cleaned);

  return matches
    .map((m) => ({
      date: m.date,
      confidence: scoreDateCandidate(m, cleaned),
      rawText: rawText.substring(Math.max(0, m.index - 5), m.index + 20).trim(),
      pattern: m.pattern,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}
