import { describe, expect, it } from "vitest";
import { expandMapsUrl, findMapsUrl, parseMapsUrl, resolveMapsLink } from "../src/lib/maps";

const FULL =
  "https://www.google.com/maps/place/Amatinink%C5%B3+u%C5%BEeiga/@54.6795,25.2858,17z/data=!3m1!4b1!4m6!3m5!1s0x46dd946f:0x1!8m2!3d54.6797212!4d25.2881938!16s%2Fg%2F1tdx?entry=ttu";

describe("findMapsUrl", () => {
  it("extracts a link from shared text", () => {
    expect(findMapsUrl("Amatininkų užeiga\nhttps://maps.app.goo.gl/AbC123xyz")).toBe("https://maps.app.goo.gl/AbC123xyz");
    expect(findMapsUrl(`see ${FULL} there`)).toBe(FULL);
    expect(findMapsUrl("https://example.com/maps")).toBeNull();
  });
});

describe("parseMapsUrl", () => {
  it("prefers the place pin over the map centre", () => {
    expect(parseMapsUrl(FULL)).toEqual({ name: "Amatininkų užeiga", lat: 54.6797212, lng: 25.2881938 });
  });

  it("falls back to the map centre and to ?q=", () => {
    expect(parseMapsUrl("https://www.google.com/maps/place/Bo%C4%8Diai/@54.68,25.28,15z")).toEqual({
      name: "Bočiai",
      lat: 54.68,
      lng: 25.28,
    });
    expect(parseMapsUrl("https://maps.google.com/maps?q=54.6872,25.2797")).toEqual({ name: null, lat: 54.6872, lng: 25.2797 });
    expect(parseMapsUrl("https://www.google.com/maps/search/?api=1&query=Grey+Vilnius").name).toBe("Grey Vilnius");
  });
});

/** Fake fetch: maps URL → response. */
function fakeFetch(routes: Record<string, { status: number; location?: string; json?: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const r = routes[key];
    return new Response(r.json ? JSON.stringify(r.json) : null, {
      status: r.status,
      headers: r.location ? { location: r.location } : {},
    });
  }) as typeof fetch;
}

describe("share links", () => {
  it("follows redirects through the EU consent page", async () => {
    const fetcher = fakeFetch({
      "https://maps.app.goo.gl/AbC": {
        status: 302,
        location: `https://consent.google.com/m?continue=${encodeURIComponent(FULL)}&gl=LT`,
      },
    });
    expect(await expandMapsUrl("https://maps.app.goo.gl/AbC", fetcher)).toBe(FULL);
  });

  it("resolves name, pin and street address", async () => {
    const fetcher = fakeFetch({
      "https://maps.app.goo.gl/AbC": { status: 302, location: FULL },
      "https://nominatim.openstreetmap.org/reverse": {
        status: 200,
        json: { address: { road: "Didžioji gatvė", house_number: "19", city: "Vilnius" } },
      },
    });
    expect(await resolveMapsLink("Look: https://maps.app.goo.gl/AbC", fetcher)).toEqual({
      name: "Amatininkų užeiga",
      lat: 54.6797212,
      lng: 25.2881938,
      address: "Didžioji gatvė 19",
      city: "Vilnius",
      mapUrl: "https://maps.app.goo.gl/AbC",
    });
  });

  it("still returns the place when address lookup fails", async () => {
    const fetcher = fakeFetch({ "https://nominatim.openstreetmap.org/reverse": { status: 503 } });
    expect(await resolveMapsLink(FULL, fetcher)).toMatchObject({ name: "Amatininkų užeiga", address: null });
  });
});
