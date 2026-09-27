import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PRODUCE_CATALOG,
  findProduceByAlias,
  type ProduceEntry,
} from './catalog';

export interface RgbPixel {
  r: number;
  g: number;
  b: number;
}

export interface ProduceMatch {
  entry: ProduceEntry;
  confidence: number;
  quantity: number;
  unit: ProduceEntry['defaultUnit'];
  reason: string;
}

const CORRECTIONS_KEY = 'foodie_produce_corrections_v1';

type Corrections = Record<string, string>; // fingerprint → produce id

async function loadCorrections(): Promise<Corrections> {
  try {
    const raw = await AsyncStorage.getItem(CORRECTIONS_KEY);
    return raw ? (JSON.parse(raw) as Corrections) : {};
  } catch {
    return {};
  }
}

export async function rememberProduceCorrection(
  fingerprint: string,
  produceId: string,
): Promise<void> {
  const map = await loadCorrections();
  map[fingerprint] = produceId;
  await AsyncStorage.setItem(CORRECTIONS_KEY, JSON.stringify(map));
}

/** RGB → HSV (h in degrees). */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function averageColor(pixels: RgbPixel[]): RgbPixel {
  if (pixels.length === 0) return { r: 128, g: 128, b: 128 };
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = pixels.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export function colorFingerprint(avg: RgbPixel): string {
  const { h, s, v } = rgbToHsv(avg.r, avg.g, avg.b);
  return `${Math.round(h / 10) * 10}:${Math.round(s * 10)}:${Math.round(v * 10)}`;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function scoreEntry(entry: ProduceEntry, h: number, s: number, v: number): number {
  const bestHue = Math.min(...entry.hues.map((eh) => hueDistance(h, eh)));
  const hueScore = Math.max(0, 1 - bestHue / 60);
  const satOk = s >= entry.saturation[0] && s <= entry.saturation[1];
  const valOk = v >= entry.value[0] && v <= entry.value[1];
  const satScore = satOk ? 1 : Math.max(0, 1 - Math.min(
    Math.abs(s - entry.saturation[0]),
    Math.abs(s - entry.saturation[1]),
  ) * 2);
  const valScore = valOk ? 1 : Math.max(0, 1 - Math.min(
    Math.abs(v - entry.value[0]),
    Math.abs(v - entry.value[1]),
  ) * 2);
  return hueScore * 0.55 + satScore * 0.25 + valScore * 0.2;
}

/**
 * Estimate count from how "busy" the non-background pixel set is.
 * Heuristic only — always confirmed by the user in the UI.
 */
export function estimateQuantity(
  entry: ProduceEntry,
  foregroundRatio: number,
): number {
  if (entry.defaultUnit === 'g' || entry.defaultUnit === 'kg') {
    return entry.typicalQuantity;
  }
  // Low coverage → single item; high → pile approaching typicalQuantity
  const scaled = Math.round(1 + foregroundRatio * (entry.typicalQuantity - 1));
  return Math.max(1, Math.min(entry.typicalQuantity * 2, scaled));
}

export interface RecognizeOptions {
  /** Sampled pixels from a downscaled frame (centre-weighted preferred). */
  pixels: RgbPixel[];
  /** Optional on-device classifier labels (ML Kit etc.) — offline only. */
  labels?: string[];
  foregroundRatio?: number;
}

/**
 * Offline produce recognition.
 * Priority: user corrections → classifier aliases → colour signature match.
 * No network / LLM calls.
 */
export async function recognizeProduce(opts: RecognizeOptions): Promise<ProduceMatch[]> {
  const avg = averageColor(opts.pixels);
  const { h, s, v } = rgbToHsv(avg.r, avg.g, avg.b);
  const fp = colorFingerprint(avg);
  const corrections = await loadCorrections();
  const fg = opts.foregroundRatio ?? 0.45;

  const results: ProduceMatch[] = [];

  if (corrections[fp]) {
    const entry = PRODUCE_CATALOG.find((p) => p.id === corrections[fp]);
    if (entry) {
      results.push({
        entry,
        confidence: 0.92,
        quantity: estimateQuantity(entry, fg),
        unit: entry.defaultUnit,
        reason: 'local-correction',
      });
    }
  }

  for (const label of opts.labels ?? []) {
    const entry = findProduceByAlias(label);
    if (!entry) continue;
    if (results.some((r) => r.entry.id === entry.id)) continue;
    results.push({
      entry,
      confidence: 0.85,
      quantity: estimateQuantity(entry, fg),
      unit: entry.defaultUnit,
      reason: `label:${label}`,
    });
  }

  const scored = PRODUCE_CATALOG.map((entry) => ({
    entry,
    score: scoreEntry(entry, h, s, v),
  }))
    .filter((x) => x.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  for (const { entry, score } of scored.slice(0, 5)) {
    if (results.some((r) => r.entry.id === entry.id)) continue;
    results.push({
      entry,
      confidence: Math.min(0.8, score),
      quantity: estimateQuantity(entry, fg),
      unit: entry.defaultUnit,
      reason: 'color-match',
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
