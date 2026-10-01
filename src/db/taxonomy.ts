// Categories (places only) and tags (products and places): vocabularies linked by name.

interface Link {
  vocab: "tags" | "categories";
  table: "product_tags" | "place_tags" | "place_categories";
  owner: "product_id" | "place_id";
  ref: "tag_id" | "category_id";
}

export const PRODUCT_TAGS: Link = { vocab: "tags", table: "product_tags", owner: "product_id", ref: "tag_id" };
export const PLACE_TAGS: Link = { vocab: "tags", table: "place_tags", owner: "place_id", ref: "tag_id" };
export const PLACE_CATEGORIES: Link = {
  vocab: "categories",
  table: "place_categories",
  owner: "place_id",
  ref: "category_id",
};

/** Trims, collapses whitespace and removes case-insensitive duplicates. */
export function cleanNames(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

/** Statements that replace the owner's links with exactly `names`, creating vocabulary entries as needed. */
export function setLinksStatements(db: D1Database, link: Link, ownerId: number, names: string[]): D1PreparedStatement[] {
  const clean = cleanNames(names);
  return [
    db.prepare(`DELETE FROM ${link.table} WHERE ${link.owner} = ?`).bind(ownerId),
    ...clean.map((name) => db.prepare(`INSERT INTO ${link.vocab} (name) VALUES (?) ON CONFLICT (name) DO NOTHING`).bind(name)),
    ...clean.map((name) =>
      db
        .prepare(`INSERT INTO ${link.table} (${link.owner}, ${link.ref}) SELECT ?, id FROM ${link.vocab} WHERE name = ?`)
        .bind(ownerId, name),
    ),
  ];
}

export async function listVocabulary(db: D1Database, link: Link): Promise<{ name: string; count: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT v.name, COUNT(l.${link.owner}) AS count
       FROM ${link.vocab} v LEFT JOIN ${link.table} l ON l.${link.ref} = v.id
       GROUP BY v.id HAVING count > 0 ORDER BY count DESC, v.name`,
    )
    .all<{ name: string; count: number }>();
  return results;
}
