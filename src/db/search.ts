// Search uses a normalised `search_text` column on products and places:
// lower-case, no diacritics ("Žemaičių" → "zemaiciu", "Ёлка" → "елка"), so a plain LIKE
// matches regardless of case or accents in any script.

export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function compose(...parts: (string | null | undefined)[]): string {
  return normalize(parts.filter(Boolean).join(" "));
}

export async function refreshProductSearch(db: D1Database, id: number): Promise<void> {
  const row = await db
    .prepare(
      `SELECT barcode, name, brand, category, review,
         (SELECT group_concat(t.name, ' ') FROM product_tags pt JOIN tags t ON t.id = pt.tag_id
          WHERE pt.product_id = p.id) AS tags
       FROM products p WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, string | null>>();
  if (!row) return;
  const text = compose(row.name, row.brand, row.category, row.barcode, row.tags, row.review);
  await db.prepare("UPDATE products SET search_text = ? WHERE id = ?").bind(text, id).run();
}

export async function refreshPlaceSearch(db: D1Database, id: number): Promise<void> {
  const row = await db
    .prepare(
      `SELECT name, city, address, notes,
         (SELECT group_concat(c.name, ' ') FROM place_categories pc JOIN categories c ON c.id = pc.category_id
          WHERE pc.place_id = p.id) AS categories,
         (SELECT group_concat(t.name, ' ') FROM place_tags pt JOIN tags t ON t.id = pt.tag_id
          WHERE pt.place_id = p.id) AS tags,
         (SELECT group_concat(d.name, ' ') FROM dishes d WHERE d.place_id = p.id) AS dishes
       FROM places p WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, string | null>>();
  if (!row) return;
  const text = compose(row.name, row.categories, row.tags, row.dishes, row.city, row.address, row.notes);
  await db.prepare("UPDATE places SET search_text = ? WHERE id = ?").bind(text, id).run();
}

export interface SearchHit {
  kind: "product" | "place";
  id: number;
  name: string;
  subtitle: string | null;
  rating: number | null;
}

export type SearchKind = "all" | "product" | "place";

/** Every word of the query must appear somewhere in the item's searchable text. */
export async function search(db: D1Database, query: string, kind: SearchKind = "all", limit = 20): Promise<SearchHit[]> {
  const terms = normalize(query).split(" ").filter(Boolean).slice(0, 8);
  if (terms.length === 0) return [];
  const where = terms.map(() => "search_text LIKE ? ESCAPE '\\'").join(" AND ");
  const patterns = terms.map((t) => `%${t.replace(/[\\%_]/g, "\\$&")}%`);

  const statements: D1PreparedStatement[] = [];
  if (kind !== "place") {
    statements.push(
      db
        .prepare(`SELECT 'product' AS kind, id, name, brand AS subtitle, rating FROM products WHERE ${where} LIMIT 100`)
        .bind(...patterns),
    );
  }
  if (kind !== "product") {
    statements.push(
      db
        .prepare(
          `SELECT 'place' AS kind, id, name, rating,
             (SELECT group_concat(c.name, ', ') FROM place_categories pc JOIN categories c ON c.id = pc.category_id
              WHERE pc.place_id = p.id) AS subtitle
           FROM places p WHERE ${where} LIMIT 100`,
        )
        .bind(...patterns),
    );
  }
  const hits = (await db.batch<SearchHit>(statements)).flatMap((r) => r.results);

  // Name matches first (exact > prefix > contains), then by rating.
  const q = terms.join(" ");
  const score = (hit: SearchHit) => {
    const name = normalize(hit.name);
    return name === q ? 3 : name.startsWith(q) ? 2 : name.includes(q) ? 1 : 0;
  };
  return hits
    .sort((a, b) => score(b) - score(a) || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
