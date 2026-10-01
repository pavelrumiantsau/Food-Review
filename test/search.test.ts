import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDish, createPlace } from "../src/db/places";
import { createProduct } from "../src/db/products";
import { normalize, search } from "../src/db/search";
import { setupDb } from "./helpers";

let t: Awaited<ReturnType<typeof setupDb>>;
beforeAll(async () => (t = await setupDb()));
afterAll(() => t.dispose());
beforeEach(() => t.reset());

describe("normalize", () => {
  it("strips diacritics and case in Latin and Cyrillic", () => {
    expect(normalize("Žemaičių  Blynai")).toBe("zemaiciu blynai");
    expect(normalize("ЁЛКА Пицца")).toBe("елка пицца");
  });
});

describe("search", () => {
  it("matches without diacritics, by category and by dish", async () => {
    const place = await createPlace(t.db, { name: "Amatininkų užeiga", categories: ["Lithuanian"], rating: 10 });
    await addDish(t.db, place.id, { name: "Cepelinai", rating: 9 });

    for (const q of ["amatininku", "UŽEIGA", "lithuanian", "cepelinai"]) {
      expect((await search(t.db, q)).map((h) => h.id), q).toEqual([place.id]);
    }
  });

  it("requires every word and ranks name matches first, then rating", async () => {
    await createPlace(t.db, { name: "Pizza Marinara", categories: ["Pizza"], rating: 8 });
    await createPlace(t.db, { name: "Double Pizza", categories: ["Pizza"], rating: 6 });
    await createPlace(t.db, { name: "Casa della pasta", categories: ["Italian", "Pizza"], rating: 10 });
    await createProduct(t.db, { name: "Frozen pizza", brand: "Dr. Oetker", rating: 4 });

    expect((await search(t.db, "pizza")).map((h) => h.name)).toEqual([
      "Pizza Marinara",
      "Double Pizza",
      "Frozen pizza",
      "Casa della pasta",
    ]);
    expect((await search(t.db, "pizza oetker")).map((h) => h.name)).toEqual(["Frozen pizza"]);
    expect((await search(t.db, "pizza", "place")).every((h) => h.kind === "place")).toBe(true);
  });

  it("finds products by barcode and Cyrillic name", async () => {
    await createProduct(t.db, { name: "Сырок глазированный", barcode: "4770000000017", rating: 9 });
    expect(await search(t.db, "4770000000017")).toHaveLength(1);
    expect(await search(t.db, "сырок")).toHaveLength(1);
  });

  it("treats LIKE wildcards literally", async () => {
    await createProduct(t.db, { name: "Milk 2.5%" });
    await createProduct(t.db, { name: "Milk 25" });
    expect((await search(t.db, "2.5%")).map((h) => h.name)).toEqual(["Milk 2.5%"]);
    expect(await search(t.db, "   ")).toEqual([]);
  });
});
