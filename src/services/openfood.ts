export interface OpenFoodLookupResult {
  productName?: string;
  brand?: string;
  category?: string;
}

interface OpenFoodProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  categories_tags?: string[];
}

interface OpenFoodResponse {
  status?: number;
  product?: OpenFoodProduct;
}

const OPEN_FOOD_API = 'https://world.openfoodfacts.org/api/v2/product';

export async function lookupBarcode(barcode: string): Promise<OpenFoodLookupResult | null> {
  const cleaned = barcode.replace(/[^\dA-Za-z]/g, '');
  if (!cleaned) return null;

  const url = `${OPEN_FOOD_API}/${encodeURIComponent(cleaned)}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json() as OpenFoodResponse;
  if (data.status !== 1 || !data.product) return null;

  const productName = pickNonEmpty(data.product.product_name, data.product.product_name_en);
  const brand = pickBrand(data.product.brands);
  const category = mapCategory(data.product.categories_tags ?? []);

  if (!productName && !brand && !category) return null;
  return { productName, brand, category };
}

function pickNonEmpty(...vals: Array<string | undefined>): string | undefined {
  for (const value of vals) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function pickBrand(brands?: string): string | undefined {
  if (!brands) return undefined;
  const first = brands.split(',')[0]?.trim();
  return first || undefined;
}

function mapCategory(tags: string[]): string | undefined {
  const joined = tags.join(' ').toLowerCase();
  if (joined.includes('beverage') || joined.includes('coffee') || joined.includes('drink')) return 'coffee';
  if (joined.includes('pharmacy') || joined.includes('medicine') || joined.includes('supplement')) return 'pharmacy';
  if (joined.includes('cosmetic') || joined.includes('fashion')) return 'fashion';
  return 'grocery';
}
