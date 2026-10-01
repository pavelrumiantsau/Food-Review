import { describe, expect, it } from "vitest";
import { cleanCategory } from "../scripts/category-map.ts";
import { convertRating, type ImportedPlace, toSql } from "../scripts/import-excel.ts";
import { search } from "../src/db/search";
import { getPlace, listPlaces } from "../src/db/places";
import { setupDb } from "./helpers";

describe("cleanCategory", () => {
  it.each([
    ["Overall", ["General"]],
    ["Chineese", ["Chinese"]],
    ["Chicken ", ["Chicken"]],
    ["BBQ", ["BBQ"]],
    ["Burger", ["Burgers"]],
    ["Kebab and pizza", ["Kebab", "Pizza"]],
    ["Pizza, sushi and wok", ["Pizza", "Sushi", "Wok"]],
    ["Breakfast / Coffee", ["Breakfast", "Coffee"]],
    ["Breakfasts and deserts", ["Breakfast", "Desserts"]],
    ["Vegeterian pizza", ["Vegetarian", "Pizza"]],
    ["Mac'n'cheese", ["Mac'n'cheese"]],
    ["Šašlykas", ["Šašlykas"]],
    [null, []],
  ])("%s → %j", (raw, expected) => {
    expect(cleanCategory(raw)).toEqual(expected);
  });
});

describe("convertRating", () => {
  it("doubles 1–5 and rejects anything else", () => {
    expect(convertRating(4, 2)).toBe(8);
    expect(convertRating(null, 2)).toBeNull();
    expect(() => convertRating(4.5, 7)).toThrow("Row 7");
    expect(() => convertRating(6, 7)).toThrow();
  });
});

describe("toSql", () => {
  const places: ImportedPlace[] = [
    { row: 2, name: "Amatininkų užeiga", rating: 10, categories: ["Lithuanian"], rawCategory: "Lithuanian", notes: null, website: null },
    { row: 3, name: "Archie's Burger", rating: null, categories: ["Burgers", "General"], rawCategory: "x", notes: "It's 'fine'", website: "http://a.lt" },
  ];

  it("produces SQL that imports once, flags ratings and is searchable", async () => {
    const t = await setupDb();
    try {
      const statements = toSql(places).split("\n").filter((l) => l && !l.startsWith("--"));
      for (let run = 0; run < 2; run++) await t.db.batch(statements.map((s) => t.db.prepare(s)));

      const all = await listPlaces(t.db);
      expect(all.map((p) => [p.name, p.rating, p.rating_imported, p.categories])).toEqual([
        ["Amatininkų užeiga", 10, true, ["Lithuanian"]],
        ["Archie's Burger", null, false, ["Burgers", "General"]],
      ]);
      const archie = await getPlace(t.db, all[1].id);
      expect(archie).toMatchObject({ notes: "It's 'fine'", website: "http://a.lt", city: "Vilnius" });
      expect((await search(t.db, "amatininku")).map((h) => h.name)).toEqual(["Amatininkų užeiga"]);
    } finally {
      await t.dispose();
    }
  });
});
