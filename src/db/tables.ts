/** All data tables in foreign-key order: a restore inserts them in this order. */
export const TABLES = [
  "categories",
  "tags",
  "products",
  "product_ratings",
  "places",
  "place_categories",
  "product_tags",
  "place_tags",
  "visits",
  "dishes",
] as const;
