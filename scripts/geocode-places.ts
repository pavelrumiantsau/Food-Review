// Finds coordinates and street addresses for places without a location, by name, in
// OpenStreetMap (Nominatim; free, max 1 request/second). Writes a review report and SQL;
// applies nothing by itself.
//
//   node scripts/geocode-places.ts            → data/geocode-report.csv + data/geocode.sql
//   npx wrangler d1 execute food-review --remote --file data/geocode.sql
//
// Responses are cached in data/geocode-cache.json, so re-runs only query new places.
// Manual review decisions go in data/geocode-overrides.json: {"accept": [names], "reject": [names]}
// ("accept" takes the best candidate of a weak result; "reject" drops a match).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { normalize } from "../src/db/search.ts";
import { sqlLiteral } from "./sql.ts";

const USER_AGENT = "Food-Review/0.1 (personal project; github.com/pavelrumiantsau/Food-Review)";
// Vilnius bounding box: left, top, right, bottom.
const VIEWBOX = "25.02,54.84,25.48,54.56";
const CACHE = "data/geocode-cache.json";
const OVERRIDES = "data/geocode-overrides.json";

export interface NominatimResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name: string;
  address?: Record<string, string>;
}

const FOOD_TYPES = new Set([
  "amenity/restaurant",
  "amenity/cafe",
  "amenity/fast_food",
  "amenity/bar",
  "amenity/pub",
  "amenity/food_court",
  "amenity/ice_cream",
  "amenity/biergarten",
  "shop/kiosk",
  "shop/bakery",
  "shop/pastry",
  "shop/confectionery",
  "shop/deli",
  "shop/coffee",
  "shop/tea",
]);

// Words that say what kind of place it is rather than which one.
const GENERIC = new Set(
  "restoranas restorane restaurant kavine cafe caffe kavinukas bistro baras bar picerija pizzeria pizza pica house vilnius by the and ir"
    .split(" "),
);

export function nameKey(name: string): string[] {
  const tokens = normalize(name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  const specific = tokens.filter((t) => !GENERIC.has(t));
  return specific.length ? specific : tokens;
}

/**
 * How well an OpenStreetMap name matches ours: 1 = same, 0.9 = theirs contains every word of
 * ours (e.g. "Bočiai Vilniuje"), otherwise word overlap (Jaccard). Deliberately one-way: a
 * short OSM name like "Grill" must not match our "Agan Grill".
 */
export function similarity(ours: string, theirs: string): number {
  const ka = nameKey(ours);
  const kb = nameKey(theirs);
  if (ka.join(" ") === kb.join(" ")) return 1;
  const sa = new Set(ka);
  const sb = new Set(kb);
  const shared = [...sa].filter((t) => sb.has(t)).length;
  if (shared === sa.size) return 0.9;
  return shared / new Set([...sa, ...sb]).size;
}

export type Status = "match" | "ambiguous" | "weak" | "none";

export interface Classified {
  status: Status;
  best?: NominatimResult;
  score: number;
  candidates: number;
}

const metres = (a: NominatimResult, b: NominatimResult) => {
  const k = Math.cos((Number(a.lat) * Math.PI) / 180);
  return Math.hypot(Number(a.lat) - Number(b.lat), (Number(a.lon) - Number(b.lon)) * k) * 111_320;
};

/**
 * match: exactly one food place with a (near-)identical name.
 * ambiguous: several such places (a chain) — we can't know which branch.
 * weak: something similar but not convincing. none: nothing.
 */
export function classify(name: string, results: NominatimResult[]): Classified {
  const scored = results
    .filter((r) => r.name)
    .map((r) => ({ r, score: similarity(name, r.name), food: FOOD_TYPES.has(`${r.category}/${r.type}`) }))
    .sort((x, y) => y.score - x.score || Number(y.food) - Number(x.food));
  const strong = scored.filter((s) => s.food && s.score >= 0.9);
  // The same place is often mapped twice (node + building); collapse anything within 60 m.
  const distinct = strong.filter((s, i) => strong.findIndex((o) => metres(o.r, s.r) < 60) === i);
  if (distinct.length === 1) return { status: "match", best: distinct[0].r, score: distinct[0].score, candidates: 1 };
  if (distinct.length > 1) return { status: "ambiguous", best: distinct[0].r, score: distinct[0].score, candidates: distinct.length };
  const top = scored[0];
  if (top && top.score >= 0.5) return { status: "weak", best: top.r, score: top.score, candidates: scored.length };
  return { status: "none", score: top?.score ?? 0, candidates: scored.length };
}

export const streetAddress = (r: NominatimResult) =>
  [r.address?.road ?? r.address?.pedestrian ?? r.address?.square, r.address?.house_number].filter(Boolean).join(" ") || null;

async function searchNominatim(name: string, city: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: `${name}, ${city}`,
    format: "jsonv2",
    addressdetails: "1",
    limit: "10",
    viewbox: VIEWBOX,
    bounded: "1",
    "accept-language": "lt",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as NominatimResult[];
}

/** Lithuanian street addresses for OSM objects, 50 per request ("N123" / "W456" ids). */
async function lookupAddresses(results: NominatimResult[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(results.map((r) => `${r.osm_type[0].toUpperCase()}${r.osm_id}`))];
  const addresses = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({ osm_ids: ids.slice(i, i + 50).join(","), format: "jsonv2", addressdetails: "1", "accept-language": "lt" });
    const res = await fetch(`https://nominatim.openstreetmap.org/lookup?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim lookup ${res.status}`);
    for (const r of (await res.json()) as NominatimResult[]) addresses.set(`${r.osm_type}/${r.osm_id}`, streetAddress(r));
    await new Promise((r) => setTimeout(r, 1100));
  }
  return addresses;
}

interface PlaceRow {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
}

function loadPlaces(): PlaceRow[] {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "food-review", "--remote", "--json", "--command",
      "SELECT id, name, city, address FROM places WHERE lat IS NULL ORDER BY name"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return (JSON.parse(out) as { results: PlaceRow[] }[])[0].results;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

if (import.meta.main) {
  const places = loadPlaces();
  const cache: Record<string, NominatimResult[]> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  console.log(`${places.length} places without a location; ${places.filter((p) => cache[p.name]).length} cached.`);

  const rows: string[] = [["id", "name", "status", "score", "osm_name", "osm_type", "address", "lat", "lng", "candidates", "osm_link"].join(",")];
  const sql = ["-- Generated by scripts/geocode-places.ts: confident matches only. Never overwrites existing values."];
  const counts: Record<Status | "rejected", number> = { match: 0, ambiguous: 0, weak: 0, none: 0, rejected: 0 };

  for (const [i, place] of places.entries()) {
    if (!cache[place.name]) {
      cache[place.name] = await searchNominatim(place.name, place.city ?? "Vilnius");
      writeFileSync(CACHE, JSON.stringify(cache));
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim policy: max 1 request/second
    }
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${places.length}…`);
  }

  const overrides: { accept?: string[]; reject?: string[] } = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, "utf8")) : {};
  const classified = places.map((place) => {
    const c = classify(place.name, cache[place.name]);
    if (overrides.reject?.includes(place.name)) return { place, c: { ...c, status: "rejected" as const } };
    if (overrides.accept?.includes(place.name) && c.best) return { place, c: { ...c, status: "match" as const } };
    return { place, c };
  });
  // Addresses in Lithuanian street form ("Gedimino pr. 9"), whatever language the search returned.
  const lt = await lookupAddresses(classified.filter(({ c }) => c.best && c.status !== "none").map(({ c }) => c.best!));
  const address = (r: NominatimResult) => lt.get(`${r.osm_type}/${r.osm_id}`) ?? streetAddress(r);

  for (const { place, c } of classified) {
    counts[c.status]++;
    const b = c.best;
    rows.push(
      [place.id, place.name, c.status, c.score.toFixed(2), b?.name, b && `${b.category}/${b.type}`, b && address(b),
        b?.lat, b?.lon, c.candidates, b && `https://www.openstreetmap.org/${b.osm_type}/${b.osm_id}`]
        .map(csvCell)
        .join(","),
    );
    if (c.status === "match" && b) {
      const street = address(b);
      // A new address also becomes searchable (search_text is normally rebuilt by the app).
      const searchAppend = street ? `CASE WHEN address IS NULL THEN search_text || ${sqlLiteral(` ${normalize(street)}`)} ELSE search_text END` : "search_text";
      sql.push(
        `UPDATE places SET lat = ${Number(b.lat)}, lng = ${Number(b.lon)}, search_text = ${searchAppend}, ` +
          `address = COALESCE(address, ${sqlLiteral(street)}) WHERE id = ${place.id} AND lat IS NULL;`,
      );
    }
  }

  writeFileSync("data/geocode-report.csv", "﻿" + rows.join("\r\n") + "\r\n");
  writeFileSync("data/geocode.sql", sql.join("\n") + "\n");
  console.log(
    `\nmatch ${counts.match}, ambiguous (chains) ${counts.ambiguous}, weak ${counts.weak}, none ${counts.none}, rejected by review ${counts.rejected}`,
  );
  console.log("Review data/geocode-report.csv, then apply with:\n  npx wrangler d1 execute food-review --remote --file data/geocode.sql");
}
