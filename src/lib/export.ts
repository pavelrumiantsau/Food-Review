// Full backup (JSON with every table, restorable with scripts/restore.ts) plus
// spreadsheet-friendly CSV views. Sent as Telegram documents by /export and the weekly cron.
import { type Api, InputFile, InputMediaBuilder } from "grammy";
import { TABLES } from "../db/tables";

export const BACKUP_VERSION = 1;

export interface Backup {
  app: "food-review";
  version: number;
  exported_at: string;
  tables: Record<(typeof TABLES)[number], Record<string, unknown>[]>;
}

export async function buildBackup(db: D1Database): Promise<Backup> {
  const results = await db.batch(TABLES.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`)));
  return {
    app: "food-review",
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    tables: Object.fromEntries(TABLES.map((t, i) => [t, results[i].results])) as Backup["tables"],
  };
}

function csv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens UTF-8 (ė, š, Cyrillic) correctly.
  return "﻿" + [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export async function buildCsvFiles(db: D1Database): Promise<Record<string, string>> {
  const [places, products, visits, dishes] = await db.batch([
    db.prepare(
      `SELECT p.name, p.rating, p.rating_imported,
         (SELECT group_concat(c.name, ', ') FROM place_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.place_id = p.id) AS categories,
         p.city, p.address, p.price_level, p.map_url, p.website,
         (SELECT group_concat(t.name, ', ') FROM place_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.place_id = p.id) AS tags,
         (SELECT COUNT(*) FROM visits v WHERE v.place_id = p.id) AS visits,
         (SELECT MAX(visited_on) FROM visits v WHERE v.place_id = p.id) AS last_visit,
         p.notes
       FROM places p ORDER BY p.name COLLATE NOCASE`,
    ),
    db.prepare(
      `SELECT p.name, p.brand, p.barcode, p.rating, p.category,
         (SELECT group_concat(t.name, ', ') FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = p.id) AS tags,
         p.review, p.updated_at
       FROM products p ORDER BY p.name COLLATE NOCASE`,
    ),
    db.prepare(
      `SELECT p.name AS place, v.visited_on, v.rating, v.notes
       FROM visits v JOIN places p ON p.id = v.place_id ORDER BY v.visited_on DESC`,
    ),
    db.prepare(
      `SELECT p.name AS place, d.name AS dish, d.rating, v.visited_on, d.notes
       FROM dishes d JOIN places p ON p.id = d.place_id LEFT JOIN visits v ON v.id = d.visit_id
       ORDER BY p.name COLLATE NOCASE, d.name`,
    ),
  ]);
  const rows = (r: D1Result) => r.results as Record<string, unknown>[];
  return {
    "places.csv": csv(rows(places), ["name", "rating", "rating_imported", "categories", "city", "address", "price_level", "map_url", "website", "tags", "visits", "last_visit", "notes"]),
    "products.csv": csv(rows(products), ["name", "brand", "barcode", "rating", "category", "tags", "review", "updated_at"]),
    "visits.csv": csv(rows(visits), ["place", "visited_on", "rating", "notes"]),
    "dishes.csv": csv(rows(dishes), ["place", "dish", "rating", "visited_on", "notes"]),
  };
}

/** Sends the JSON backup and CSV files to `chatId` as one album of documents. */
export async function sendBackup(api: Api, db: D1Database, chatId: number, title: string): Promise<void> {
  const [backup, csvFiles] = await Promise.all([buildBackup(db), buildCsvFiles(db)]);
  const date = backup.exported_at.slice(0, 10);
  const counts = `${backup.tables.places.length} places, ${backup.tables.products.length} products, ${backup.tables.visits.length} visits`;
  const encoder = new TextEncoder();
  const files: [string, string][] = [
    [`food-review-${date}.json`, JSON.stringify(backup, null, 1)],
    ...Object.entries(csvFiles).map(([name, content]): [string, string] => [`food-review-${date}-${name}`, content]),
  ];
  await api.sendMediaGroup(
    chatId,
    files.map(([name, content], i) =>
      InputMediaBuilder.document(new InputFile(encoder.encode(content), name), {
        // An album shows the caption of its last item.
        caption: i === files.length - 1 ? `${title}\n${counts}.\nThe .json file restores everything (see README).` : undefined,
      }),
    ),
  );
}
