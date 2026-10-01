import { z } from "zod";

export const rating = z.number().int().min(1).max(10).nullable();
/** Optional free text: trimmed, empty string stored as null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const name = z.string().trim().min(1).max(200);
const names = z.array(z.string().trim().min(1).max(60)).max(20);
const url = z.url().max(500).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export const barcode = z.string().regex(/^\d{8,14}$/, "expected 8–14 digits");

export const productInput = z.object({
  barcode: barcode.nullable().optional(),
  name,
  brand: text(100).optional(),
  category: text(100).optional(),
  rating: rating.optional(),
  review: text(2000).optional(),
  off_image_url: url.optional(),
  source: z.enum(["manual", "off"]).optional(),
  tags: names.optional(),
});
export const productPatch = productInput.partial();

export const productQuery = z.object({
  sort: z.enum(["recent", "rating", "name"]).optional(),
  min_rating: z.coerce.number().int().min(1).max(10).optional(),
  tag: z.string().optional(),
  barcode: barcode.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const placeInput = z.object({
  name,
  city: text(100).optional(),
  address: text(300).optional(),
  map_url: url.optional(),
  website: url.optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  price_level: z.number().int().min(1).max(4).nullable().optional(),
  rating: rating.optional(),
  notes: text(2000).optional(),
  categories: names.optional(),
  tags: names.optional(),
});
export const placePatch = placeInput.partial();

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
export const placeQuery = z.object({
  category: z.string().optional(),
  tag: z.string().optional(),
  city: z.string().optional(),
  min_rating: z.coerce.number().int().min(1).max(10).optional(),
  rated: bool.optional(),
  imported: bool.optional(),
  sort: z.enum(["name", "rating", "recent", "distance"]).optional(),
  /** "lat,lng" */
  near: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "expected lat,lng")
    .transform((v) => {
      const [lat, lng] = v.split(",").map(Number);
      return { lat, lng };
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const visitInput = z.object({
  visited_on: date,
  rating: rating.optional(),
  notes: text(2000).optional(),
});
export const visitPatch = visitInput.partial();

export const dishInput = z.object({
  name,
  visit_id: z.number().int().positive().nullable().optional(),
  rating: rating.optional(),
  notes: text(1000).optional(),
});
export const dishPatch = dishInput.partial();

export const mapsResolve = z.object({ url: z.string().max(2000) });

export const searchQuery = z.object({
  q: z.string().max(200),
  kind: z.enum(["all", "product", "place"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
