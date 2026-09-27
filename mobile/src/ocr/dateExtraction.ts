/**
 * Multi-format best-before / use-by date extraction.
 * Pure TypeScript — no LLM. Works on OCR text from any on-device engine.
 */

export interface DateExtractionResult {
  /** ISO date YYYY-MM-DD */
  date: string;
  confidence: number;
  rawText: string;
  pattern: string;
}

const MONTHS: Record<string, number> = {
  JAN: 0, JANUARY: 0,
  FEB: 1, FEBRUARY: 1,
  MAR: 2, MARCH: 2,
  APR: 3, APRIL: 3,
  MAY: 4,
  JUN: 5, JUNE: 5,
  JUL: 6, JULY: 6,
  AUG: 7, AUGUST: 7,
  SEP: 8, SEPT: 8, SEPTEMBER: 8,
  OCT: 9, OCTOBER: 9,
  NOV: 10, NOVEMBER: 10,
  DEC: 11, DECEMBER: 11,
  // Germanic / Romance short forms often OCR'd near dates
  JANUAR: 0, FEBRUAR: 1, MAERZ: 2, MÄRZ: 2, MARZ: 2,
  APRILR: 3, MAI: 4, JUNI: 5, JULI: 6, AUGUSTT: 7,
  SEPTEMBERR: 8, OKT: 9, OKTOBER: 9, NOVEMBERR: 10, DEZ: 11, DEZEMBER: 11,
};

const EXPIRY_KEYWORDS = [
  'EXP', 'EXPIRES', 'EXPIRY', 'EXP DATE', 'EXP.',
  'BEST BEFORE', 'BEST BY', 'BEST BEFORE END', 'BBE', 'BB',
  'USE BY', 'USE BEFORE', 'UB',
  'SELL BY', 'DISPLAY UNTIL',
  'MHD', 'MINDESTENS HALTBAR', 'HALTBAR BIS',
  'THT', 'TENMINSTE HOUDBAAR',
  'VERBRAUCH', 'VERBRAUCHEN BIS', 'VERBRAUCHSDATUM',
  'A CONSOMMER', 'À CONSOMMER', 'DLC', 'DLUO',
  'CONSUMIR PREFERENT', 'CONSUMIR ANTES', 'CADUCIDAD',
  'DA CONSUMARSI', 'SCADENZA', 'SCAD.',
  'PRZED', 'NAJLEPIEJ SPOZYC', 'DATA WAŻNOŚCI',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidYmd(y: number, m: number, day: number): boolean {
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const d = new Date(y, m - 1, day);
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
}

function isReasonable(d: Date): boolean {
  const now = new Date();
  const min = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const max = new Date(now.getFullYear() + 12, now.getMonth(), now.getDate());
  return d >= min && d <= max;
}

/** Common OCR confusions on packaging fonts. */
export function fixOcrMistakes(text: string): string {
  return text
    .toUpperCase()
    .replace(/[|]/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/O(?=\d)/g, '0')
    .replace(/(?<=\d)O/g, '0')
    .replace(/[Il](?=\d)/g, '1')
    .replace(/(?<=\d)[Il]/g, '1')
    .replace(/S(?=\d)/g, '5')
    .replace(/(?<=\d)S/g, '5')
    .replace(/B(?=\d)/g, '8')
    .replace(/(?<=\d)B/g, '8')
    .replace(/Z(?=\d)/g, '2')
    .replace(/(?<=\d)Z/g, '2')
    .replace(/G(?=\d)/g, '6')
    .replace(/\s+/g, ' ')
    .trim();
}

function nearKeyword(text: string, matchIndex: number): boolean {
  const window = text.substring(Math.max(0, matchIndex - 40), matchIndex + 8);
  return EXPIRY_KEYWORDS.some((k) => window.includes(k));
}

function nearLotNoise(text: string, matchIndex: number): boolean {
  const window = text.substring(Math.max(0, matchIndex - 12), matchIndex + 24);
  return /\b(LOT|BATCH|L\.|SN|SERIAL)\b/.test(window);
}

interface RawMatch {
  date: Date;
  pattern: string;
  index: number;
}

function endOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

function parseAllDates(cleaned: string): RawMatch[] {
  const results: RawMatch[] = [];

  const patterns: Array<{
    name: string;
    re: RegExp;
    parse: (m: RegExpMatchArray) => Date | null;
  }> = [
    {
      name: 'YYYY-MM-DD',
      re: /\b(20\d{2})[./\-](0?[1-9]|1[0-2])[./\-](0?[1-9]|[12]\d|3[01])\b/g,
      parse: (m) => {
        const y = +m[1]; const mo = +m[2]; const d = +m[3];
        return isValidYmd(y, mo, d) ? new Date(y, mo - 1, d) : null;
      },
    },
    {
      name: 'YYYYMMDD',
      re: /\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g,
      parse: (m) => {
        const y = +m[1]; const mo = +m[2]; const d = +m[3];
        return isValidYmd(y, mo, d) ? new Date(y, mo - 1, d) : null;
      },
    },
    {
      name: 'DD/MM/YYYY',
      re: /\b(0?[1-9]|[12]\d|3[01])[./\-](0?[1-9]|1[0-2])[./\-](20\d{2})\b/g,
      parse: (m) => {
        const d = +m[1]; const mo = +m[2]; const y = +m[3];
        return isValidYmd(y, mo, d) ? new Date(y, mo - 1, d) : null;
      },
    },
    {
      name: 'DDMMYYYY',
      re: /\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})\b/g,
      parse: (m) => {
        const d = +m[1]; const mo = +m[2]; const y = +m[3];
        return isValidYmd(y, mo, d) ? new Date(y, mo - 1, d) : null;
      },
    },
    {
      name: 'DD/MM/YY',
      re: /\b(0?[1-9]|[12]\d|3[01])[./\-](0?[1-9]|1[0-2])[./\-](\d{2})\b/g,
      parse: (m) => {
        const d = +m[1]; const mo = +m[2];
        const y = +m[3] + (+m[3] < 70 ? 2000 : 1900);
        return isValidYmd(y, mo, d) ? new Date(y, mo - 1, d) : null;
      },
    },
    {
      name: 'MM/DD/YYYY',
      re: /\b(0?[1-9]|1[0-2])[./\-](0?[1-9]|[12]\d|3[01])[./\-](20\d{2})\b/g,
      parse: (m) => {
        const mo = +m[1]; const d = +m[2]; const y = +m[3];
        // Prefer only when day > 12 (unambiguous US) or keyword hints US style
        if (d <= 12) return null;
        return isValidYmd(y, mo, d) ? new Date(y, mo - 1, d) : null;
      },
    },
    {
      name: 'MM/YY',
      re: /\b(0?[1-9]|1[0-2])[./\-](\d{2})\b/g,
      parse: (m) => {
        const mo = +m[1];
        const y = +m[2] + (+m[2] < 70 ? 2000 : 1900);
        if (mo < 1 || mo > 12) return null;
        return endOfMonth(y, mo - 1);
      },
    },
    {
      name: 'MM/YYYY',
      re: /\b(0?[1-9]|1[0-2])[./\-](20\d{2})\b/g,
      parse: (m) => {
        const mo = +m[1]; const y = +m[2];
        if (mo < 1 || mo > 12) return null;
        return endOfMonth(y, mo - 1);
      },
    },
    {
      name: 'YYYY/MM',
      re: /\b(20\d{2})[./\-](0?[1-9]|1[0-2])\b/g,
      parse: (m) => {
        const y = +m[1]; const mo = +m[2];
        return endOfMonth(y, mo - 1);
      },
    },
    {
      name: 'DD MMM YYYY',
      re: /\b(0?[1-9]|[12]\d|3[01])[\s.\-/]*(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?|MAI|JUNI|JULI|OKT(?:OBER)?|DEZ(?:EMBER)?|MÄRZ|MAERZ|MARZ)[\s.\-/]*(\d{2,4})\b/g,
      parse: (m) => {
        const mon = MONTHS[m[2].replace('Ä', 'A').replace('É', 'E')];
        if (mon === undefined) return null;
        const y = m[3].length === 2 ? +m[3] + 2000 : +m[3];
        const d = +m[1];
        return isValidYmd(y, mon + 1, d) ? new Date(y, mon, d) : null;
      },
    },
    {
      name: 'MMM DD YYYY',
      re: /\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)[\s.\-/]+(0?[1-9]|[12]\d|3[01])[,.\s\-/]+(20\d{2}|\d{2})\b/g,
      parse: (m) => {
        const mon = MONTHS[m[1]];
        if (mon === undefined) return null;
        const y = m[3].length === 2 ? +m[3] + 2000 : +m[3];
        const d = +m[2];
        return isValidYmd(y, mon + 1, d) ? new Date(y, mon, d) : null;
      },
    },
    {
      name: 'DD MMM',
      re: /\b(0?[1-9]|[12]\d|3[01])[\s.\-/]*(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\b/g,
      parse: (m) => {
        const monthIdx = MONTHS[m[2]];
        if (monthIdx === undefined) return null;
        const now = new Date();
        let d = new Date(now.getFullYear(), monthIdx, +m[1]);
        if (d < now) d = new Date(now.getFullYear() + 1, monthIdx, +m[1]);
        return d;
      },
    },
    {
      // Julian packing date: YYDDD (day-of-year) — common on dairy/egg cartons
      name: 'YYDDD',
      re: /\b([2-3]\d)([0-3]\d{2})\b/g,
      parse: (m) => {
        const y = 2000 + +m[1];
        const doy = +m[2];
        if (doy < 1 || doy > 366) return null;
        const d = new Date(y, 0, doy);
        if (d.getFullYear() !== y) return null;
        return d;
      },
    },
  ];

  for (const { re, parse, name } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      const d = parse(m);
      if (d && !Number.isNaN(d.getTime()) && isReasonable(d)) {
        results.push({ date: d, pattern: name, index: m.index });
      }
    }
  }

  return results;
}

function scoreCandidate(match: RawMatch, text: string): number {
  let score = 0.15;

  if (match.pattern.includes('YYYY') || match.pattern === 'DD MMM YYYY' || match.pattern === 'MMM DD YYYY') {
    score += 0.35;
  } else if (match.pattern === 'DD/MM/YY' || match.pattern === 'MM/YYYY') {
    score += 0.2;
  } else if (match.pattern === 'YYDDD') {
    score += 0.1;
  } else {
    score += 0.15;
  }

  if (nearKeyword(text, match.index)) score += 0.35;
  if (nearLotNoise(text, match.index)) score -= 0.35;

  const now = new Date();
  if (match.date >= now) score += 0.15;
  else score -= 0.05;

  // Prefer nearer future dates for food
  const days = (match.date.getTime() - now.getTime()) / 86_400_000;
  if (days >= 0 && days <= 90) score += 0.1;
  if (days > 365 * 5) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

export function extractDates(rawText: string): DateExtractionResult[] {
  const cleaned = fixOcrMistakes(rawText);
  const matches = parseAllDates(cleaned);

  const seen = new Set<string>();
  const results: DateExtractionResult[] = [];

  for (const m of matches) {
    const iso = toIso(m.date);
    const key = `${iso}|${m.pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      date: iso,
      confidence: scoreCandidate(m, cleaned),
      rawText: rawText.substring(Math.max(0, m.index - 5), m.index + 24).trim(),
      pattern: m.pattern,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/** Best single guess, or undefined if nothing is confident enough. */
export function bestExpiryDate(rawText: string, minConfidence = 0.35): string | undefined {
  const [top] = extractDates(rawText);
  if (!top || top.confidence < minConfidence) return undefined;
  return top.date;
}
