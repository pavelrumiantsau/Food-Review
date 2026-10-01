import type { Dish, Place, PlaceSummary, Visit } from "../types";
import { InvalidInput, NOW, splitList, updateStatement } from "./common";
import { refreshPlaceSearch } from "./search";
import { PLACE_CATEGORIES, PLACE_TAGS, setLinksStatements } from "./taxonomy";

export interface PlaceFields {
  name?: string;
  city?: string | null;
  address?: string | null;
  map_url?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  price_level?: number | null;
  rating?: number | null;
  notes?: string | null;
}

export type PlaceInput = PlaceFields & {
  name: string;
  categories?: string[];
  tags?: string[];
  /** Only for imports: marks the rating as converted from the old 5-point scale. */
  rating_imported?: boolean;
};
export type PlacePatch = PlaceFields & { categories?: string[]; tags?: string[] };

const SUMMARY_COLUMNS = `p.id, p.name, p.city, p.price_level, p.rating, p.rating_imported,
  (SELECT group_concat(c.name, char(31)) FROM place_categories pc JOIN categories c ON c.id = pc.category_id
   WHERE pc.place_id = p.id) AS categories,
  (SELECT COUNT(*) FROM visits v WHERE v.place_id = p.id) AS visit_count,
  (SELECT MAX(visited_on) FROM visits v WHERE v.place_id = p.id) AS last_visited_on`;

type SummaryRow = Omit<PlaceSummary, "categories" | "rating_imported"> & { categories: string | null; rating_imported: number };
const toSummary = (row: SummaryRow): PlaceSummary => ({
  ...row,
  rating_imported: row.rating_imported === 1,
  categories: splitList(row.categories),
});

export async function getPlace(db: D1Database, id: number): Promise<Place | null> {
  const [place, visits, dishes] = await db.batch([
    db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS}, p.address, p.map_url, p.website, p.lat, p.lng, p.notes, p.created_at, p.updated_at,
           (SELECT group_concat(t.name, char(31)) FROM place_tags pt JOIN tags t ON t.id = pt.tag_id
            WHERE pt.place_id = p.id) AS tags
         FROM places p WHERE p.id = ?`,
      )
      .bind(id),
    db.prepare("SELECT * FROM visits WHERE place_id = ? ORDER BY visited_on DESC, id DESC").bind(id),
    db.prepare("SELECT * FROM dishes WHERE place_id = ? ORDER BY rating IS NULL, rating DESC, name").bind(id),
  ]);
  const row = place.results[0] as (SummaryRow & Record<string, unknown> & { tags: string | null }) | undefined;
  if (!row) return null;
  const visitList = visits.results as unknown as Visit[];
  const rated = visitList.filter((v) => v.rating !== null);
  return {
    ...(row as unknown as Place),
    ...toSummary(row),
    tags: splitList(row.tags),
    visits: visitList,
    dishes: dishes.results as unknown as Dish[],
    visit_avg: rated.length ? Math.round((rated.reduce((s, v) => s + v.rating!, 0) / rated.length) * 10) / 10 : null,
  };
}

export interface PlaceListOptions {
  category?: string;
  tag?: string;
  city?: string;
  minRating?: number;
  rated?: boolean;
  imported?: boolean;
  sort?: "name" | "rating" | "recent";
  limit?: number;
  offset?: number;
}

const PLACE_ORDER = {
  name: "p.name COLLATE NOCASE",
  rating: "p.rating IS NULL, p.rating DESC, p.name COLLATE NOCASE",
  recent: "p.updated_at DESC",
};

export async function listPlaces(db: D1Database, opts: PlaceListOptions = {}): Promise<PlaceSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) {
    where.push(
      "p.id IN (SELECT pc.place_id FROM place_categories pc JOIN categories c ON c.id = pc.category_id WHERE c.name = ?)",
    );
    params.push(opts.category);
  }
  if (opts.tag) {
    where.push("p.id IN (SELECT pt.place_id FROM place_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?)");
    params.push(opts.tag);
  }
  if (opts.city) {
    where.push("p.city = ? COLLATE NOCASE");
    params.push(opts.city);
  }
  if (opts.minRating) {
    where.push("p.rating >= ?");
    params.push(opts.minRating);
  }
  if (opts.rated !== undefined) where.push(opts.rated ? "p.rating IS NOT NULL" : "p.rating IS NULL");
  if (opts.imported !== undefined) where.push(`p.rating_imported = ${opts.imported ? 1 : 0}`);

  const { results } = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM places p ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY ${PLACE_ORDER[opts.sort ?? "name"]} LIMIT ? OFFSET ?`,
    )
    .bind(...params, opts.limit ?? 50, opts.offset ?? 0)
    .all<SummaryRow>();
  return results.map(toSummary);
}

export async function createPlace(db: D1Database, input: PlaceInput): Promise<Place> {
  const { categories, tags, rating_imported, ...fields } = input;
  const columns: Record<string, unknown> = { ...fields, rating_imported: rating_imported ? 1 : 0 };
  const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
  const { id } = (await db
    .prepare(`INSERT INTO places (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")}) RETURNING id`)
    .bind(...keys.map((k) => columns[k] ?? null))
    .first<{ id: number }>())!;
  const links = [
    ...(categories?.length ? setLinksStatements(db, PLACE_CATEGORIES, id, categories) : []),
    ...(tags?.length ? setLinksStatements(db, PLACE_TAGS, id, tags) : []),
  ];
  if (links.length) await db.batch(links);
  await refreshPlaceSearch(db, id);
  return (await getPlace(db, id))!;
}

/** Returns null if the place does not exist. Setting a rating clears the "imported" flag. */
export async function updatePlace(db: D1Database, id: number, patch: PlacePatch): Promise<Place | null> {
  const { categories, tags, ...fields } = patch;
  const extra = [`updated_at = ${NOW}`];
  if (fields.rating !== undefined) extra.push("rating_imported = 0");
  const statements = [
    updateStatement(db, "places", id, fields, extra),
    ...(categories ? setLinksStatements(db, PLACE_CATEGORIES, id, categories) : []),
    ...(tags ? setLinksStatements(db, PLACE_TAGS, id, tags) : []),
  ].filter((s): s is D1PreparedStatement => s !== null);
  if (!(await placeExists(db, id))) return null;
  if (statements.length) await db.batch(statements);
  await refreshPlaceSearch(db, id);
  return getPlace(db, id);
}

/** Visits, dishes, categories and tags are removed by ON DELETE CASCADE. */
export async function deletePlace(db: D1Database, id: number): Promise<boolean> {
  const { meta } = await db.prepare("DELETE FROM places WHERE id = ?").bind(id).run();
  return meta.changes > 0;
}

async function placeExists(db: D1Database, id: number): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM places WHERE id = ?").bind(id).first()) !== null;
}

const touchPlace = (db: D1Database, placeId: number) =>
  db.prepare(`UPDATE places SET updated_at = ${NOW} WHERE id = ?`).bind(placeId);

// --- Visits ---

export interface VisitFields {
  visited_on?: string;
  rating?: number | null;
  notes?: string | null;
}

export async function addVisit(db: D1Database, placeId: number, input: VisitFields & { visited_on: string }): Promise<Visit | null> {
  if (!(await placeExists(db, placeId))) return null;
  const [visit] = await db.batch<Visit>([
    db
      .prepare("INSERT INTO visits (place_id, visited_on, rating, notes) VALUES (?, ?, ?, ?) RETURNING *")
      .bind(placeId, input.visited_on, input.rating ?? null, input.notes ?? null),
    touchPlace(db, placeId),
  ]);
  return visit.results[0];
}

export async function updateVisit(db: D1Database, id: number, patch: VisitFields): Promise<Visit | null> {
  const statement = updateStatement(db, "visits", id, { ...patch });
  if (statement) await statement.run();
  return db.prepare("SELECT * FROM visits WHERE id = ?").bind(id).first<Visit>();
}

export async function deleteVisit(db: D1Database, id: number): Promise<boolean> {
  const { meta } = await db.prepare("DELETE FROM visits WHERE id = ?").bind(id).run();
  return meta.changes > 0;
}

// --- Dishes (their names are searchable on the place) ---

export interface DishFields {
  name?: string;
  visit_id?: number | null;
  rating?: number | null;
  notes?: string | null;
}

async function assertVisitOfPlace(db: D1Database, visitId: number | null | undefined, placeId: number): Promise<void> {
  if (visitId == null) return;
  const ok = await db.prepare("SELECT 1 FROM visits WHERE id = ? AND place_id = ?").bind(visitId, placeId).first();
  if (!ok) throw new InvalidInput("visit_id does not belong to this place");
}

export async function addDish(db: D1Database, placeId: number, input: DishFields & { name: string }): Promise<Dish | null> {
  if (!(await placeExists(db, placeId))) return null;
  await assertVisitOfPlace(db, input.visit_id, placeId);
  const [dish] = await db.batch<Dish>([
    db
      .prepare("INSERT INTO dishes (place_id, visit_id, name, rating, notes) VALUES (?, ?, ?, ?, ?) RETURNING *")
      .bind(placeId, input.visit_id ?? null, input.name, input.rating ?? null, input.notes ?? null),
    touchPlace(db, placeId),
  ]);
  await refreshPlaceSearch(db, placeId);
  return dish.results[0];
}

export async function updateDish(db: D1Database, id: number, patch: DishFields): Promise<Dish | null> {
  const existing = await db.prepare("SELECT place_id FROM dishes WHERE id = ?").bind(id).first<{ place_id: number }>();
  if (!existing) return null;
  await assertVisitOfPlace(db, patch.visit_id, existing.place_id);
  const statement = updateStatement(db, "dishes", id, { ...patch });
  if (statement) await statement.run();
  const dish = await db.prepare("SELECT * FROM dishes WHERE id = ?").bind(id).first<Dish>();
  if (dish && patch.name !== undefined) await refreshPlaceSearch(db, dish.place_id);
  return dish;
}

export async function deleteDish(db: D1Database, id: number): Promise<boolean> {
  const dish = await db.prepare("DELETE FROM dishes WHERE id = ? RETURNING place_id").bind(id).first<{ place_id: number }>();
  if (dish) await refreshPlaceSearch(db, dish.place_id);
  return dish !== null;
}
