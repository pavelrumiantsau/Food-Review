// Domain types shared by the Worker and the Mini App (no Worker-only imports here).

export interface Product {
  id: number;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  rating: number | null;
  review: string | null;
  off_image_url: string | null;
  source: "manual" | "off";
  tags: string[];
  created_at: string;
  updated_at: string;
  /** Every rating given, oldest first (only on the single-product endpoint). */
  rating_history?: { rating: number; rated_at: string }[];
}

export interface PlaceSummary {
  id: number;
  name: string;
  city: string | null;
  price_level: number | null;
  rating: number | null;
  rating_imported: boolean;
  categories: string[];
  visit_count: number;
  last_visited_on: string | null;
  lat: number | null;
  lng: number | null;
  /** Only when listing by distance. */
  distance_km?: number;
}

export interface Visit {
  id: number;
  place_id: number;
  visited_on: string;
  rating: number | null;
  notes: string | null;
  created_at: string;
}

export interface Dish {
  id: number;
  place_id: number;
  visit_id: number | null;
  name: string;
  rating: number | null;
  notes: string | null;
  created_at: string;
}

export interface Place extends PlaceSummary {
  address: string | null;
  map_url: string | null;
  website: string | null;
  notes: string | null;
  tags: string[];
  visits: Visit[];
  dishes: Dish[];
  visit_avg: number | null;
  created_at: string;
  updated_at: string;
}

export interface SearchHit {
  kind: "product" | "place";
  id: number;
  name: string;
  subtitle: string | null;
  rating: number | null;
}

export interface OffProduct {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

export interface Stats {
  places: { total: number; rated: number; imported: number; avg: number | null };
  products: { total: number; rated: number; avg: number | null };
  visits: { total: number; last30: number };
  /** Count of items per rating; index 0 is rating 1. */
  distribution: { places: number[]; products: number[] };
  /** Categories with at least 3 rated places, best average first. */
  topCategories: { name: string; rated: number; avg: number }[];
  recentVisits: { place_id: number; name: string; visited_on: string; rating: number | null }[];
}

export interface MapsPlace {
  name: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  city: string | null;
  mapUrl: string;
}
