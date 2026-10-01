import { describe, expect, it } from "vitest";
import { escapeHtml, formatHit, shareText } from "../src/bot/format";

describe("bot formatting", () => {
  it("escapes HTML in names", () => {
    expect(escapeHtml("<b>Tom & Jerry</b>")).toBe("&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;");
    expect(formatHit({ kind: "place", id: 1, name: "A&B", subtitle: "Pizza", rating: 8 })).toBe(
      "🍽 A&amp;B — <b>8/10</b> · Pizza",
    );
  });

  it("builds plain share text", () => {
    expect(shareText({ kind: "place", id: 1, name: "Bočiai", subtitle: "Lithuanian", rating: 9 })).toBe(
      "🍽 Bočiai — 9/10 (Lithuanian)",
    );
    expect(shareText({ kind: "product", id: 2, name: "Kefir", subtitle: null, rating: null })).toBe(
      "🛒 Kefir — not rated yet",
    );
  });
});
