import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toRestoreSql } from "../scripts/restore.ts";
import { addDish, addVisit, createPlace } from "../src/db/places";
import { createProduct } from "../src/db/products";
import { buildBackup, buildCsvFiles } from "../src/lib/export";
import { setupDb } from "./helpers";

let source: Awaited<ReturnType<typeof setupDb>>;
let target: Awaited<ReturnType<typeof setupDb>>;
beforeAll(async () => {
  [source, target] = await Promise.all([setupDb(), setupDb()]);
  const place = await createPlace(source.db, {
    name: "Bočiai",
    categories: ["Lithuanian"],
    tags: ["family"],
    rating: 8,
    notes: 'Line 1\nsaid "great", really',
  });
  const visit = await addVisit(source.db, place.id, { visited_on: "2026-09-30", rating: 9 });
  await addDish(source.db, place.id, { name: "Cepelinai", rating: 10, visit_id: visit!.id });
  await createProduct(source.db, { name: "Сырок", barcode: "4770000000017", rating: 7, tags: ["dairy"] });
});
afterAll(() => Promise.all([source.dispose(), target.dispose()]));

describe("backup", () => {
  it("restores into an empty database exactly", async () => {
    const backup = await buildBackup(source.db);
    expect(backup.tables.places).toHaveLength(1);

    const statements = toRestoreSql(backup).split("\n").filter((l) => l && !l.startsWith("--"));
    await target.db.batch(statements.map((s) => target.db.prepare(s)));

    const restored = await buildBackup(target.db);
    expect(restored.tables).toEqual(backup.tables);
  });

  it("rejects unknown backup formats", () => {
    expect(() => toRestoreSql({ app: "other", version: 1, exported_at: "", tables: {} })).toThrow("Unsupported");
  });

  it("writes CSVs with a BOM and proper quoting", async () => {
    const files = await buildCsvFiles(source.db);
    const places = files["places.csv"];
    expect(places.startsWith("﻿name,rating,")).toBe(true);
    expect(places).toContain('"Line 1\nsaid ""great"", really"');
    expect(files["dishes.csv"]).toContain("Bočiai,Cepelinai,10,2026-09-30");
    expect(files["products.csv"]).toContain("Сырок,,4770000000017,7,,dairy");
  });
});

describe("sqlLiteral", async () => {
  const { sqlLiteral } = await import("../scripts/sql.ts");
  it("keeps statements on one line and escapes quotes", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral("a\nb")).toBe("('a' || char(10) || 'b')");
    expect(sqlLiteral("")).toBe("''");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(7)).toBe("7");
  });
});
