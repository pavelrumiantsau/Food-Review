import type { Stats } from "../types";

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export async function getStats(db: D1Database): Promise<Stats> {
  const [places, products, visits, placeDist, productDist, categories, recent] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS total, COUNT(rating) AS rated, SUM(rating_imported) AS imported, AVG(rating) AS avg FROM places`,
    ),
    db.prepare(`SELECT COUNT(*) AS total, COUNT(rating) AS rated, AVG(rating) AS avg FROM products`),
    db.prepare(
      `SELECT COUNT(*) AS total, SUM(visited_on >= date('now', '-30 days')) AS last30 FROM visits`,
    ),
    db.prepare(`SELECT rating, COUNT(*) AS n FROM places WHERE rating IS NOT NULL GROUP BY rating`),
    db.prepare(`SELECT rating, COUNT(*) AS n FROM products WHERE rating IS NOT NULL GROUP BY rating`),
    db.prepare(
      `SELECT c.name, COUNT(p.rating) AS rated, AVG(p.rating) AS avg
       FROM categories c JOIN place_categories pc ON pc.category_id = c.id JOIN places p ON p.id = pc.place_id
       GROUP BY c.id HAVING rated >= 3 ORDER BY avg DESC, rated DESC LIMIT 10`,
    ),
    db.prepare(
      `SELECT v.place_id, p.name, v.visited_on, v.rating FROM visits v JOIN places p ON p.id = v.place_id
       ORDER BY v.visited_on DESC, v.id DESC LIMIT 5`,
    ),
  ]);
  type Row = Record<string, number | null>;
  const one = (r: D1Result) => r.results[0] as Row;
  const histogram = (r: D1Result) => {
    const counts = Array<number>(10).fill(0);
    for (const row of r.results as { rating: number; n: number }[]) counts[row.rating - 1] = row.n;
    return counts;
  };
  const p = one(places);
  const pr = one(products);
  const v = one(visits);
  return {
    places: { total: p.total ?? 0, rated: p.rated ?? 0, imported: p.imported ?? 0, avg: round1(p.avg) },
    products: { total: pr.total ?? 0, rated: pr.rated ?? 0, avg: round1(pr.avg) },
    visits: { total: v.total ?? 0, last30: v.last30 ?? 0 },
    distribution: { places: histogram(placeDist), products: histogram(productDist) },
    topCategories: (categories.results as { name: string; rated: number; avg: number }[]).map((c) => ({
      ...c,
      avg: round1(c.avg)!,
    })),
    recentVisits: recent.results as Stats["recentVisits"],
  };
}
