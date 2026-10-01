import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/index";
import { authHeader, setupDb } from "./helpers";

let t: Awaited<ReturnType<typeof setupDb>>;
beforeAll(async () => (t = await setupDb()));
afterAll(() => t.dispose());
beforeEach(() => t.reset());

async function call(method: string, path: string, body?: unknown, headers = authHeader()) {
  const res = await app.request(
    `/api${path}`,
    { method, headers: { ...headers, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) },
    t.env,
  );
  return { status: res.status, body: res.status === 204 ? null : await res.json<any>() };
}

describe("auth", () => {
  it("rejects missing, invalid and foreign users", async () => {
    expect((await call("GET", "/me", undefined, {})).status).toBe(401);
    expect((await call("GET", "/me", undefined, { Authorization: "tma hash=abc" })).status).toBe(401);
    expect((await call("GET", "/me", undefined, authHeader(7))).status).toBe(403);
    expect((await call("GET", "/me")).status).toBe(200);
  });
});

describe("products", () => {
  it("creates, finds by barcode, updates and deletes", async () => {
    const created = await call("POST", "/products", { name: " Kefir ", barcode: "4770000000017", rating: 7, tags: ["dairy", "Dairy"] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Kefir", rating: 7, tags: ["dairy"] });

    const byBarcode = await call("GET", "/products?barcode=4770000000017");
    expect(byBarcode.body.items.map((p: any) => p.id)).toEqual([created.body.id]);

    const updated = await call("PATCH", `/products/${created.body.id}`, { rating: 9, review: "" });
    expect(updated.body).toMatchObject({ rating: 9, review: null, tags: ["dairy"] });

    expect((await call("DELETE", `/products/${created.body.id}`)).status).toBe(204);
    expect((await call("GET", `/products/${created.body.id}`)).status).toBe(404);
  });

  it("validates ratings as whole numbers 1–10", async () => {
    for (const rating of [0, 11, 7.5]) {
      expect((await call("POST", "/products", { name: "X", rating })).status, String(rating)).toBe(400);
    }
  });

  it("rejects a duplicate barcode + name with 409", async () => {
    await call("POST", "/products", { name: "Kefir", barcode: "4770000000017" });
    expect((await call("POST", "/products", { name: "Kefir", barcode: "4770000000017" })).status).toBe(409);
    expect((await call("POST", "/products", { name: "Kefir light", barcode: "4770000000017" })).status).toBe(201);
  });
});

describe("places", () => {
  it("handles categories, visits, dishes, filters and cascade delete", async () => {
    const { body: place } = await call("POST", "/places", { name: "Bočiai", categories: ["Lithuanian"], rating: 8 });
    const { body: visit } = await call("POST", `/places/${place.id}/visits`, { visited_on: "2026-09-30", rating: 9 });
    await call("POST", `/places/${place.id}/visits`, { visited_on: "2026-08-01", rating: 6 });
    await call("POST", `/places/${place.id}/dishes`, { name: "Cepelinai", rating: 10, visit_id: visit.id });

    const { body: full } = await call("GET", `/places/${place.id}`);
    expect(full).toMatchObject({
      categories: ["Lithuanian"],
      visit_count: 2,
      last_visited_on: "2026-09-30",
      visit_avg: 7.5,
      dishes: [{ name: "Cepelinai", visit_id: visit.id }],
    });

    const lithuanian = await call("GET", "/places?category=lithuanian&min_rating=8");
    expect(lithuanian.body.items.map((p: any) => p.id)).toEqual([place.id]);
    expect((await call("GET", "/places?rated=false")).body.items).toEqual([]);

    expect((await call("DELETE", `/places/${place.id}`)).status).toBe(204);
    const leftovers = await t.db.prepare("SELECT (SELECT COUNT(*) FROM visits) + (SELECT COUNT(*) FROM dishes) AS n").first<{ n: number }>();
    expect(leftovers!.n).toBe(0);
  });

  it("clears the imported flag when the rating is changed", async () => {
    const { body: place } = await call("POST", "/places", { name: "Grey", rating: 10 });
    await t.db.prepare("UPDATE places SET rating_imported = 1 WHERE id = ?").bind(place.id).run();
    expect((await call("GET", "/places?imported=true")).body.items).toHaveLength(1);

    await call("PATCH", `/places/${place.id}`, { notes: "still great" });
    expect((await call("GET", `/places/${place.id}`)).body.rating_imported).toBe(true);

    await call("PATCH", `/places/${place.id}`, { rating: 9 });
    expect((await call("GET", `/places/${place.id}`)).body).toMatchObject({ rating: 9, rating_imported: false });
  });

  it("rejects a dish linked to another place's visit", async () => {
    const { body: a } = await call("POST", "/places", { name: "A" });
    const { body: b } = await call("POST", "/places", { name: "B" });
    const { body: visit } = await call("POST", `/places/${a.id}/visits`, { visited_on: "2026-09-30" });
    expect((await call("POST", `/places/${b.id}/dishes`, { name: "Soup", visit_id: visit.id })).status).toBe(400);
  });

  it("returns 404 for missing places", async () => {
    expect((await call("PATCH", "/places/999", { rating: 5 })).status).toBe(404);
    expect((await call("POST", "/places/999/visits", { visited_on: "2026-09-30" })).status).toBe(404);
  });
});

describe("search endpoint", () => {
  it("returns hits across products and places", async () => {
    await call("POST", "/places", { name: "Sushi Express", categories: ["Sushi"] });
    await call("POST", "/products", { name: "Sushi rice" });
    const { body } = await call("GET", "/search?q=sushi");
    expect(body.results.map((h: any) => h.kind).sort()).toEqual(["place", "product"]);
  });
});
