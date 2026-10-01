import type { Product, SearchHit } from "../types";

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const formatRating = (rating: number | null) => (rating === null ? "not rated" : `<b>${rating}/10</b>`);

export function formatHit(hit: SearchHit): string {
  const icon = hit.kind === "place" ? "🍽" : "🛒";
  const subtitle = hit.subtitle ? ` · ${escapeHtml(hit.subtitle)}` : "";
  return `${icon} ${escapeHtml(hit.name)} — ${formatRating(hit.rating)}${subtitle}`;
}

/** Plain-text line for sharing a rating in another chat (inline mode). */
export function shareText(hit: SearchHit): string {
  const icon = hit.kind === "place" ? "🍽" : "🛒";
  const rating = hit.rating === null ? "not rated yet" : `${hit.rating}/10`;
  return `${icon} ${hit.name} — ${rating}${hit.subtitle ? ` (${hit.subtitle})` : ""}`;
}

export function formatProduct(p: Product): string {
  const lines = [`🛒 <b>${escapeHtml(p.name)}</b>${p.brand ? ` · ${escapeHtml(p.brand)}` : ""}`, `Rating: ${formatRating(p.rating)}`];
  if (p.review) lines.push(`<i>${escapeHtml(p.review)}</i>`);
  return lines.join("\n");
}
