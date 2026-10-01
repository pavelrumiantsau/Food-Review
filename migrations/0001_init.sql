-- Initial schema. Ratings are whole numbers 1–10; NULL means "not rated yet".
-- search_text is a lower-cased, diacritic-free copy of the searchable fields,
-- maintained by the app (see src/db/search.ts). FTS5 is avoided because
-- `wrangler d1 export` does not support virtual tables.

CREATE TABLE products (
  id            INTEGER PRIMARY KEY,
  barcode       TEXT,
  name          TEXT NOT NULL,
  brand         TEXT,
  category      TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 10),
  review        TEXT,
  off_image_url TEXT,
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'off')),
  search_text   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX products_barcode ON products (barcode);
CREATE UNIQUE INDEX products_barcode_name ON products (barcode, name) WHERE barcode IS NOT NULL;

CREATE TABLE places (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  city            TEXT DEFAULT 'Vilnius',
  address         TEXT,
  map_url         TEXT,
  website         TEXT,
  lat             REAL,
  lng             REAL,
  price_level     INTEGER CHECK (price_level BETWEEN 1 AND 4),
  rating          INTEGER CHECK (rating BETWEEN 1 AND 10),
  rating_imported INTEGER NOT NULL DEFAULT 0 CHECK (rating_imported IN (0, 1)),
  notes           TEXT,
  search_text     TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE place_categories (
  place_id    INTEGER NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (place_id, category_id)
);
CREATE INDEX place_categories_category ON place_categories (category_id);

CREATE TABLE visits (
  id         INTEGER PRIMARY KEY,
  place_id   INTEGER NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  visited_on TEXT NOT NULL, -- YYYY-MM-DD
  rating     INTEGER CHECK (rating BETWEEN 1 AND 10),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX visits_place ON visits (place_id, visited_on);

CREATE TABLE dishes (
  id         INTEGER PRIMARY KEY,
  place_id   INTEGER NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  visit_id   INTEGER REFERENCES visits (id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  rating     INTEGER CHECK (rating BETWEEN 1 AND 10),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX dishes_place ON dishes (place_id);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE product_tags (
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE place_tags (
  place_id INTEGER NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (place_id, tag_id)
);
