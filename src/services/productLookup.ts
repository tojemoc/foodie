import type { ProductInfo } from '../types';

export async function lookupProduct(ean: string): Promise<ProductInfo | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
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
  }
}
