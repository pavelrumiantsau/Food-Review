// Open Food Facts product lookup: https://openfoodfacts.github.io/openfoodfacts-server/api/
import type { OffProduct } from "../types";

const FIELDS = "product_name,product_name_en,brands,image_front_small_url";

export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
    headers: { "User-Agent": "Food-Review/0.1 (personal project; github.com/pavelrumiantsau/Food-Review)" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const body = (await res.json()) as { status: number; product?: Record<string, string | undefined> };
  if (body.status !== 1 || !body.product) return null;
  const p = body.product;
  return {
    barcode,
    name: p.product_name || p.product_name_en || null,
    brand: p.brands?.split(",")[0]?.trim() || null,
    imageUrl: p.image_front_small_url || null,
  };
}
