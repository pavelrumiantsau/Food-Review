import type { Product } from "../types";
import { NOW, splitList, updateStatement } from "./common";
import { refreshProductSearch } from "./search";
import { PRODUCT_TAGS, setLinksStatements } from "./taxonomy";

export interface ProductFields {
  barcode?: string | null;
  name?: string;
  brand?: string | null;
  category?: string | null;
  rating?: number | null;
  review?: string | null;
  off_image_url?: string | null;
  source?: "manual" | "off";
}

export type ProductInput = ProductFields & { name: string; tags?: string[] };
export type ProductPatch = ProductFields & { tags?: string[] };

const SELECT = `SELECT id, barcode, name, brand, category, rating, review, off_image_url, source, created_at, updated_at,
  (SELECT group_concat(t.name, char(31)) FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
   WHERE pt.product_id = p.id) AS tags
  FROM products p`;

type Row = Omit<Product, "tags"> & { tags: string | null };
const toProduct = (row: Row): Product => ({ ...row, tags: splitList(row.tags) });

export async function getProduct(db: D1Database, id: number): Promise<Product | null> {
  const [product, history] = await db.batch([
    db.prepare(`${SELECT} WHERE id = ?`).bind(id),
    db.prepare("SELECT rating, rated_at FROM product_ratings WHERE product_id = ? ORDER BY rated_at, id").bind(id),
  ]);
  const row = product.results[0] as Row | undefined;
  return row ? { ...toProduct(row), rating_history: history.results as Product["rating_history"] } : null;
}

const recordRating = (db: D1Database, productId: number, rating: number) =>
  db.prepare("INSERT INTO product_ratings (product_id, rating) VALUES (?, ?)").bind(productId, rating);

export async function findProductsByBarcode(db: D1Database, barcode: string): Promise<Product[]> {
  const { results } = await db.prepare(`${SELECT} WHERE barcode = ? ORDER BY updated_at DESC`).bind(barcode).all<Row>();
  return results.map(toProduct);
}

export interface ProductListOptions {
  sort?: "recent" | "rating" | "name";
  minRating?: number;
  tag?: string;
  limit?: number;
  offset?: number;
}

const PRODUCT_ORDER = {
  recent: "updated_at DESC",
  rating: "rating IS NULL, rating DESC, name",
  name: "name COLLATE NOCASE",
};

export async function listProducts(db: D1Database, opts: ProductListOptions = {}): Promise<Product[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.minRating) {
    where.push("rating >= ?");
    params.push(opts.minRating);
  }
  if (opts.tag) {
    where.push("id IN (SELECT pt.product_id FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?)");
    params.push(opts.tag);
  }
  const sql = `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${PRODUCT_ORDER[opts.sort ?? "recent"]} LIMIT ? OFFSET ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...params, opts.limit ?? 50, opts.offset ?? 0)
    .all<Row>();
  return results.map(toProduct);
}

export async function createProduct(db: D1Database, input: ProductInput): Promise<Product> {
  const { tags, ...fields } = input;
  const keys = Object.keys(fields).filter((k) => fields[k as keyof ProductFields] !== undefined);
  const { id } = (await db
    .prepare(`INSERT INTO products (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")}) RETURNING id`)
    .bind(...keys.map((k) => fields[k as keyof ProductFields] ?? null))
    .first<{ id: number }>())!;
  const follow = [
    ...(tags?.length ? setLinksStatements(db, PRODUCT_TAGS, id, tags) : []),
    ...(fields.rating ? [recordRating(db, id, fields.rating)] : []),
  ];
  if (follow.length) await db.batch(follow);
  await refreshProductSearch(db, id);
  return (await getProduct(db, id))!;
}

/** Returns null if the product does not exist. */
export async function updateProduct(db: D1Database, id: number, patch: ProductPatch): Promise<Product | null> {
  const { tags, ...fields } = patch;
  const current = await db.prepare("SELECT rating FROM products WHERE id = ?").bind(id).first<{ rating: number | null }>();
  if (!current) return null;
  const statements = [
    updateStatement(db, "products", id, fields, [`updated_at = ${NOW}`]),
    ...(tags ? setLinksStatements(db, PRODUCT_TAGS, id, tags) : []),
    // A changed rating is appended to the history.
    ...(fields.rating && fields.rating !== current.rating ? [recordRating(db, id, fields.rating)] : []),
  ].filter((s): s is D1PreparedStatement => s !== null);
  if (statements.length) await db.batch(statements);
  await refreshProductSearch(db, id);
  return getProduct(db, id);
}

export async function deleteProduct(db: D1Database, id: number): Promise<boolean> {
  const { meta } = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return meta.changes > 0;
}
