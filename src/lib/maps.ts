// Google Maps links → place name + coordinates (+ street address via OpenStreetMap Nominatim).
// Handles full links (google.com/maps/place/…) and share links (maps.app.goo.gl/…), which
// redirect — in the EU sometimes via a consent page carrying the target in `continue`.
import type { MapsPlace } from "../types";

const MAPS_URL = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.|maps\.)?google\.[a-z.]{2,6}\/maps)\S*/i;
const USER_AGENT = "Food-Review/0.1 (personal project; github.com/pavelrumiantsau/Food-Review)";

/** First Google Maps link in a text (e.g. what iOS "Share" puts into a message), or null. */
export function findMapsUrl(text: string): string | null {
  return text.match(MAPS_URL)?.[0] ?? null;
}

/** Name and coordinates encoded in a full Google Maps URL. */
export function parseMapsUrl(raw: string): { name: string | null; lat: number | null; lng: number | null } {
  const url = new URL(raw);
  const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " ")).trim();
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  let name = place ? decode(place[1]) : null;

  // !3d<lat>!4d<lng> is the place's own pin; @lat,lng is just the map centre.
  const pin = raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const centre = raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = url.searchParams.get("q") ?? url.searchParams.get("query");
  const qCoords = q?.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  const coords = pin ?? qCoords ?? centre;
  if (!name && q && !qCoords) name = q.trim();
  // A /place/ segment that is itself coordinates is not a name.
  if (name && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(name)) name = null;

  return { name, lat: coords ? Number(coords[1]) : null, lng: coords ? Number(coords[2]) : null };
}

/** Follows share-link redirects (and EU consent pages) to the full Google Maps URL. */
export async function expandMapsUrl(raw: string, fetcher: typeof fetch = fetch): Promise<string> {
  let url = raw;
  for (let hop = 0; hop < 6; hop++) {
    const host = new URL(url).hostname;
    if (host.startsWith("consent.google.")) {
      const target = new URL(url).searchParams.get("continue");
      if (!target) break;
      url = target;
      continue;
    }
    if (/google\.[a-z.]+$/.test(host) && new URL(url).pathname.startsWith("/maps")) return url;
    const res = await fetcher(url, { redirect: "manual", headers: { "User-Agent": USER_AGENT } });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    break;
  }
  return url;
}

/** Street address and city for coordinates, from OpenStreetMap (free, max 1 request/second). */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetcher: typeof fetch = fetch,
): Promise<{ address: string | null; city: string | null }> {
  const res = await fetcher(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!res.ok) return { address: null, city: null };
  const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.square, a.house_number].filter(Boolean).join(" ") || null;
  return { address: street, city: a.city ?? a.town ?? a.village ?? null };
}

export async function resolveMapsLink(raw: string, fetcher: typeof fetch = fetch): Promise<MapsPlace | null> {
  const mapUrl = findMapsUrl(raw);
  if (!mapUrl) return null;
  const full = await expandMapsUrl(mapUrl, fetcher);
  const { name, lat, lng } = parseMapsUrl(full);
  if (!name && lat === null) return null;
  const geo = lat !== null && lng !== null ? await reverseGeocode(lat, lng, fetcher).catch(() => null) : null;
  return { name, lat, lng, address: geo?.address ?? null, city: geo?.city ?? null, mapUrl };
}
