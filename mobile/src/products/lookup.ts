import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ProductInfo {
  name: string;
  brand?: string;
  imageUrl?: string;
  category?: string;
  quantityHint?: string;
  source: string;
}

const CACHE_KEY = 'foodie_product_cache_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CacheMap = Record<string, { at: number; product: ProductInfo }>;

async function readCache(): Promise<CacheMap> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

async function writeCache(map: CacheMap): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

async function cacheGet(barcode: string): Promise<ProductInfo | null> {
  const map = await readCache();
  const hit = map[barcode];
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) return null;
  return { ...hit.product, source: `${hit.product.source}+cache` };
}

async function cacheSet(barcode: string, product: ProductInfo): Promise<void> {
  const map = await readCache();
  map[barcode] = { at: Date.now(), product };
  // Cap cache size
  const keys = Object.keys(map);
  if (keys.length > 500) {
    keys
      .sort((a, b) => (map[a]?.at ?? 0) - (map[b]?.at ?? 0))
      .slice(0, keys.length - 500)
      .forEach((k) => delete map[k]);
  }
  await writeCache(map);
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  image_front_small_url?: string;
  image_url?: string;
  categories_tags?: string[];
  quantity?: string;
}

interface OffResponse {
  status?: number;
  product?: OffProduct;
}

function pickName(p: OffProduct): string | undefined {
  for (const v of [p.product_name, p.product_name_en, p.generic_name]) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

function pickBrand(brands?: string): string | undefined {
  const first = brands?.split(',')[0]?.trim();
  return first || undefined;
}

function mapCategory(tags: string[] = []): string | undefined {
  const joined = tags.join(' ').toLowerCase();
  if (joined.includes('dairy') || joined.includes('milk') || joined.includes('cheese')) return 'dairy';
  if (joined.includes('meat') || joined.includes('poultry') || joined.includes('fish')) return 'meat';
  if (joined.includes('fruit') || joined.includes('vegetable') || joined.includes('produce')) return 'produce';
  if (joined.includes('beverage') || joined.includes('drink')) return 'beverage';
  if (joined.includes('snack') || joined.includes('biscuit') || joined.includes('candy')) return 'snack';
  if (joined.includes('frozen')) return 'frozen';
  return 'grocery';
}

async function fetchOff(base: string, barcode: string, source: string): Promise<ProductInfo | null> {
  try {
    const url = `${base}/${encodeURIComponent(barcode)}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FoodieNative/3.0 (side-store; grocery-tracker)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OffResponse;
    if (data.status !== 1 || !data.product) return null;
    const name = pickName(data.product);
    if (!name) return null;
    return {
      name,
      brand: pickBrand(data.product.brands),
      imageUrl: data.product.image_front_small_url || data.product.image_url,
      category: mapCategory(data.product.categories_tags),
      quantityHint: data.product.quantity,
      source,
    };
  } catch {
    return null;
  }
}

/** UPC/EAN open dataset — no API key, rate-limited. */
async function fetchUpcItemDb(barcode: string): Promise<ProductInfo | null> {
  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: Array<{ title?: string; brand?: string; images?: string[]; category?: string }>;
    };
    const item = data.items?.[0];
    if (!item?.title) return null;
    return {
      name: item.title,
      brand: item.brand,
      imageUrl: item.images?.[0],
      category: item.category?.split('>')[0]?.trim().toLowerCase() || 'grocery',
      source: 'upcitemdb',
    };
  } catch {
    return null;
  }
}

const PROVIDERS: Array<(barcode: string) => Promise<ProductInfo | null>> = [
  (b) => fetchOff('https://world.openfoodfacts.org/api/v2/product', b, 'openfoodfacts'),
  (b) => fetchOff('https://world.openproductsfacts.org/api/v2/product', b, 'openproductsfacts'),
  (b) => fetchOff('https://world.openbeautyfacts.org/api/v2/product', b, 'openbeautyfacts'),
  fetchUpcItemDb,
];

/**
 * Multi-source barcode lookup with offline cache.
 * Never calls an LLM — only public product databases + local cache.
 */
export async function lookupBarcode(barcode: string): Promise<ProductInfo | null> {
  const cleaned = barcode.replace(/[^\dA-Za-z]/g, '');
  if (!cleaned || cleaned.length < 8) return null;

  const cached = await cacheGet(cleaned);
  if (cached) return cached;

  for (const provider of PROVIDERS) {
    const hit = await provider(cleaned);
    if (hit) {
      await cacheSet(cleaned, hit);
      return hit;
    }
  }
  return null;
}

export async function rememberProduct(barcode: string, product: ProductInfo): Promise<void> {
  const cleaned = barcode.replace(/[^\dA-Za-z]/g, '');
  if (!cleaned) return;
  await cacheSet(cleaned, { ...product, source: product.source || 'manual' });
}
