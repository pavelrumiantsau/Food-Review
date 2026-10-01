import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { InvalidInput } from "../db/common";
import * as places from "../db/places";
import * as products from "../db/products";
import { search } from "../db/search";
import { getStats } from "../db/stats";
import { listVocabulary, PLACE_CATEGORIES, PLACE_TAGS, PRODUCT_TAGS } from "../db/taxonomy";
import type { Env } from "../env";
import { resolveMapsLink } from "../lib/maps";
import { lookupBarcode } from "../lib/off";
import { type TelegramUser, validateInitData } from "../lib/telegram-auth";
import * as s from "./schemas";

type AppEnv = { Bindings: Env; Variables: { user: TelegramUser } };

const ID = ":id{[0-9]+}";
const notFound = { error: "not_found" } as const;

export const api = new Hono<AppEnv>();

// Every request carries `Authorization: tma <initData>` from the Mini App.
api.use("*", async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const user = header.startsWith("tma ") ? await validateInitData(header.slice(4), c.env.BOT_TOKEN) : null;
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.id !== Number(c.env.OWNER_TELEGRAM_ID)) return c.json({ error: "forbidden" }, 403);
  c.set("user", user);
  await next();
});

api.onError((err, c) => {
  if (err instanceof InvalidInput) return c.json({ error: "invalid", message: err.message }, 400);
  if (/UNIQUE constraint failed/.test(err.message)) return c.json({ error: "conflict", message: err.message }, 409);
  if (/(CHECK|FOREIGN KEY) constraint failed/.test(err.message)) return c.json({ error: "invalid", message: err.message }, 400);
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

const id = (param: string) => Number(param);

api.get("/me", (c) => c.json({ user: c.get("user") }));

api.get("/stats", async (c) => c.json(await getStats(c.env.DB)));

api.get("/search", zValidator("query", s.searchQuery), async (c) => {
  const { q, kind, limit } = c.req.valid("query");
  return c.json({ results: await search(c.env.DB, q, kind, limit) });
});

api.get("/off/:barcode{[0-9]{8,14}}", async (c) => {
  const product = await lookupBarcode(c.req.param("barcode"));
  return product ? c.json(product) : c.json(notFound, 404);
});

api.post("/maps/resolve", zValidator("json", s.mapsResolve), async (c) => {
  const place = await resolveMapsLink(c.req.valid("json").url);
  return place ? c.json(place) : c.json({ error: "not_a_maps_link" }, 422);
});

// --- Products ---

api.get("/products", zValidator("query", s.productQuery), async (c) => {
  const q = c.req.valid("query");
  const items = q.barcode
    ? await products.findProductsByBarcode(c.env.DB, q.barcode)
    : await products.listProducts(c.env.DB, { ...q, minRating: q.min_rating });
  return c.json({ items });
});

api.get(`/products/${ID}`, async (c) => {
  const product = await products.getProduct(c.env.DB, id(c.req.param("id")));
  return product ? c.json(product) : c.json(notFound, 404);
});

api.post("/products", zValidator("json", s.productInput), async (c) =>
  c.json(await products.createProduct(c.env.DB, c.req.valid("json")), 201),
);

api.patch(`/products/${ID}`, zValidator("json", s.productPatch), async (c) => {
  const product = await products.updateProduct(c.env.DB, id(c.req.param("id")), c.req.valid("json"));
  return product ? c.json(product) : c.json(notFound, 404);
});

api.delete(`/products/${ID}`, async (c) =>
  (await products.deleteProduct(c.env.DB, id(c.req.param("id")))) ? c.body(null, 204) : c.json(notFound, 404),
);

// --- Places ---

api.get("/places", zValidator("query", s.placeQuery), async (c) => {
  const q = c.req.valid("query");
  return c.json({ items: await places.listPlaces(c.env.DB, { ...q, minRating: q.min_rating }) });
});

api.get(`/places/${ID}`, async (c) => {
  const place = await places.getPlace(c.env.DB, id(c.req.param("id")));
  return place ? c.json(place) : c.json(notFound, 404);
});

api.post("/places", zValidator("json", s.placeInput), async (c) =>
  c.json(await places.createPlace(c.env.DB, c.req.valid("json")), 201),
);

api.patch(`/places/${ID}`, zValidator("json", s.placePatch), async (c) => {
  const place = await places.updatePlace(c.env.DB, id(c.req.param("id")), c.req.valid("json"));
  return place ? c.json(place) : c.json(notFound, 404);
});

api.delete(`/places/${ID}`, async (c) =>
  (await places.deletePlace(c.env.DB, id(c.req.param("id")))) ? c.body(null, 204) : c.json(notFound, 404),
);

// --- Visits & dishes ---

api.post(`/places/${ID}/visits`, zValidator("json", s.visitInput), async (c) => {
  const visit = await places.addVisit(c.env.DB, id(c.req.param("id")), c.req.valid("json"));
  return visit ? c.json(visit, 201) : c.json(notFound, 404);
});

api.patch(`/visits/${ID}`, zValidator("json", s.visitPatch), async (c) => {
  const visit = await places.updateVisit(c.env.DB, id(c.req.param("id")), c.req.valid("json"));
  return visit ? c.json(visit) : c.json(notFound, 404);
});

api.delete(`/visits/${ID}`, async (c) =>
  (await places.deleteVisit(c.env.DB, id(c.req.param("id")))) ? c.body(null, 204) : c.json(notFound, 404),
);

api.post(`/places/${ID}/dishes`, zValidator("json", s.dishInput), async (c) => {
  const dish = await places.addDish(c.env.DB, id(c.req.param("id")), c.req.valid("json"));
  return dish ? c.json(dish, 201) : c.json(notFound, 404);
});

api.patch(`/dishes/${ID}`, zValidator("json", s.dishPatch), async (c) => {
  const dish = await places.updateDish(c.env.DB, id(c.req.param("id")), c.req.valid("json"));
  return dish ? c.json(dish) : c.json(notFound, 404);
});

api.delete(`/dishes/${ID}`, async (c) =>
  (await places.deleteDish(c.env.DB, id(c.req.param("id")))) ? c.body(null, 204) : c.json(notFound, 404),
);

// --- Vocabularies (for filters and autocomplete) ---

api.get("/categories", async (c) => c.json({ items: await listVocabulary(c.env.DB, PLACE_CATEGORIES) }));

api.get("/tags", async (c) => {
  const [product, place] = await Promise.all([
    listVocabulary(c.env.DB, PRODUCT_TAGS),
    listVocabulary(c.env.DB, PLACE_TAGS),
  ]);
  return c.json({ product, place });
});
