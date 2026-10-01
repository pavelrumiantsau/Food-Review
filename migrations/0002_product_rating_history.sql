-- Every rating given to a product, so re-tasting over time is visible.
-- products.rating stays the current rating; rows here are appended when it changes.

CREATE TABLE product_ratings (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  rated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX product_ratings_product ON product_ratings (product_id, rated_at);

INSERT INTO product_ratings (product_id, rating, rated_at)
SELECT id, rating, updated_at FROM products WHERE rating IS NOT NULL;
