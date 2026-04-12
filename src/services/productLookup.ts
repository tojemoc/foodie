import type { ProductInfo } from '../types';

const LOOKUP_TIMEOUT_MS = 8000;

export async function lookupProduct(ean: string): Promise<ProductInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const encoded = encodeURIComponent(ean.trim());
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encoded}.json`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;
    const p = data.product;
    return {
      name: p.product_name || p.generic_name || 'Unknown Product',
      imageUrl: p.image_front_small_url || p.image_url,
      brand: p.brands,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
