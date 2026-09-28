/**
 * Inventory CSV import — Slovak inventúra format and English aliases.
 *
 * Expected header (flexible): jedlo/food, koľko/qty, miesto/location, dátum/date
 * Example rows:
 *   2x oatly,1 l,pantry,6.6.2027
 *   zavarané uhorky,,pantry,31.12.2027
 *   starkin džem,,,otvorený 20.9.2026
 */

export interface CsvImportRow {
  name: string;
  quantity?: number;
  unit?: string;
  notes: string;
  placement?: string;
  expiryDate?: string;
}

export interface CsvImportResult {
  rows: CsvImportRow[];
  skipped: number;
}

const HEADER_NAME = /^(jedlo|food|name|item|produkt)$/i;
const HEADER_QTY = /^(koľko|kolko|qty|quantity|amount|množstvo|mnozstvo)$/i;
const HEADER_PLACE = /^(miesto|location|placement|place|uloženie|ulozenie)$/i;
const HEADER_DATE = /^(dátum|datum|date|expiry|exp|best.?before|spotreba)$/i;

const PLACEMENT_MAP: Record<string, string> = {
  pantry: 'pantry',
  spajza: 'pantry',
  'špajza': 'pantry',
  'spižírňa': 'pantry',
  fridge: 'fridge',
  chladnicka: 'fridge',
  'chladnička': 'fridge',
  refrigerator: 'fridge',
  freezer: 'freezer',
  mraznicka: 'freezer',
  'mraznička': 'freezer',
  counter: 'counter',
  linka: 'counter',
};

export function parseInventoryCsv(text: string): CsvImportResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.length) return { rows: [], skipped: 0 };

  let start = 0;
  let idxName = 0;
  let idxQty = 1;
  let idxPlace = 2;
  let idxDate = 3;

  const first = parseCsvLine(lines[0] ?? '');
  if (first.some(cell => HEADER_NAME.test(cell.trim()) || HEADER_DATE.test(cell.trim()))) {
    first.forEach((cell, i) => {
      const t = cell.trim();
      if (HEADER_NAME.test(t)) idxName = i;
      else if (HEADER_QTY.test(t)) idxQty = i;
      else if (HEADER_PLACE.test(t)) idxPlace = i;
      else if (HEADER_DATE.test(t)) idxDate = i;
    });
    start = 1;
  }

  const rows: CsvImportRow[] = [];
  let skipped = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line || /^,+$/.test(line)) {
      skipped++;
      continue;
    }
    const cols = parseCsvLine(line);
    const rawName = (cols[idxName] ?? '').trim();
    if (!rawName) {
      skipped++;
      continue;
    }

    const parsedName = parseLeadingQuantity(rawName);
    if (parsedName.quantity === 0) {
      // Explicit 0x … = out of stock — skip
      skipped++;
      continue;
    }

    const qtyCell = (cols[idxQty] ?? '').trim();
    const placeCell = (cols[idxPlace] ?? '').trim();
    const dateCell = (cols[idxDate] ?? '').trim();

    const noteParts: string[] = [];
    if (qtyCell) noteParts.push(qtyCell);

    let expiryDate: string | undefined = parseFlexibleDate(dateCell) ?? undefined;
    if (!expiryDate && dateCell) {
      // e.g. "otvorený 20.9.2026" — keep full text in notes, still try to extract a date
      noteParts.push(dateCell);
      const embedded = dateCell.match(/(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{2,4})/);
      if (embedded) {
        expiryDate = parseFlexibleDate(`${embedded[1]}.${embedded[2]}.${embedded[3]}`) ?? undefined;
      }
    }

    const unitFromQty = qtyCell.match(
      /^([\d.,]+)\s*(g|kg|ml|l|ks|cloves|clove)?$/i,
    );
    const quantity = parsedName.quantity
      ?? (unitFromQty ? Number(unitFromQty[1]!.replace(',', '.')) : undefined);
    const unit = unitFromQty?.[2]?.toLowerCase();

    let placement = normalizePlacement(placeCell);
    if (!placement) {
      placement = inferPlacementFromName(parsedName.name);
    }

    rows.push({
      name: parsedName.name,
      quantity: Number.isFinite(quantity as number) ? quantity : undefined,
      unit: unit || undefined,
      notes: noteParts.join(' · '),
      placement,
      expiryDate: expiryDate ?? undefined,
    });
  }

  return { rows, skipped };
}

/** Split a CSV line respecting double-quoted fields. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseLeadingQuantity(raw: string): { name: string; quantity?: number } {
  const m = /^(\d+)\s*x\s+(.+)$/i.exec(raw.trim());
  if (!m) return { name: raw.trim() };
  return { name: m[2]!.trim(), quantity: Number(m[1]) };
}

/** Parse D.M.YYYY / D.M YYYY / YYYY-MM-DD into YYYY-MM-DD. */
export function parseFlexibleDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[.\-/](\d{1,2})[.\-/ ]+(\d{2,4})$/.exec(t);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function normalizePlacement(raw: string): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return PLACEMENT_MAP[key] ?? (['pantry', 'fridge', 'freezer', 'counter'].includes(key) ? key : key);
}

function inferPlacementFromName(name: string): string | undefined {
  const n = name.toLowerCase();
  if (/(^|\s)mrazen|freezer|zmrzlin|gyoza|paratha|pizza ham|salami pizza/.test(n)) {
    return 'freezer';
  }
  if (/(^|\s)syr|cottage|lučina|mliek|oatly|džem/.test(n)) {
    return 'fridge';
  }
  return undefined;
}
