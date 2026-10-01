import { describe, expect, it } from "vitest";
import { classify, type NominatimResult, nameKey, similarity } from "../scripts/geocode-places.ts";

const r = (name: string, lat: number, lon: number, type = "restaurant", category = "amenity"): NominatimResult => ({
  osm_type: "node",
  osm_id: Math.round(lat * 1e6),
  lat: String(lat),
  lon: String(lon),
  category,
  type,
  name,
});

describe("name matching", () => {
  it("ignores case, diacritics, punctuation and generic words", () => {
    expect(nameKey("Bočiai restoranas")).toEqual(["bociai"]);
    expect(similarity("Amatininkų užeiga", "Amatininku Uzeiga")).toBe(1);
    expect(similarity("Grey", "Grey Restaurant")).toBe(1);
    expect(similarity("Bočiai", "Bočiai Vilniuje")).toBe(0.9);
    expect(similarity("Agan Grill", "Grill House")).toBe(0.5);
    expect(similarity("Agan Grill", "Grill")).toBe(0.5);
  });
});

describe("classify", () => {
  it("accepts one food place with the same name, collapsing duplicates mapped twice", () => {
    const c = classify("Bočiai", [r("Bočiai", 54.68, 25.28), r("Bočiai", 54.6801, 25.2801), r("Bočiai bus stop", 54.7, 25.3, "bus_stop", "highway")]);
    expect(c).toMatchObject({ status: "match", candidates: 1 });
  });

  it("flags chains with several branches as ambiguous", () => {
    expect(classify("Dodo Pizza", [r("Dodo Pizza", 54.68, 25.28), r("Dodo Pizza", 54.72, 25.25)]).status).toBe("ambiguous");
  });

  it("does not accept non-food or loosely similar results", () => {
    expect(classify("Grey", [r("Grey", 54.68, 25.28, "hotel", "tourism")]).status).toBe("weak");
    expect(classify("Agan Grill", [r("Grill House", 54.68, 25.28)]).status).toBe("weak");
    expect(classify("Agan Grill", [r("Kebab Palace", 54.68, 25.28)]).status).toBe("none");
    expect(classify("Anything", []).status).toBe("none");
  });
});
