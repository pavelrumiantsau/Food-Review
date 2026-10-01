// Cleans the free-text "Category" column of the old Excel list into a set of category names.
// Edit RENAME / SPLIT_AS to change how the import maps categories.

/** Lower-cased raw name → canonical name (spelling fixes and merges). */
export const RENAME: Record<string, string> = {
  overall: "General",
  chineese: "Chinese",
  japaneese: "Japanese",
  vietnameese: "Vietnamese",
  portugeese: "Portuguese",
  vegeterian: "Vegetarian",
  chiken: "Chicken",
  deserts: "Desserts",
  pasteries: "Pastries",
  breakfasts: "Breakfast",
  burger: "Burgers",
  "middle-eastern": "Middle eastern",
  boba: "Bubble tea",
};

/** Whole raw values that should become several categories but have no separator. */
export const SPLIT_AS: Record<string, string[]> = {
  "vegeterian pizza": ["Vegetarian", "Pizza"],
};

function canonical(part: string): string {
  const name = part.trim().replace(/\s+/g, " ");
  return RENAME[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

/** "Pizza, sushi and wok" → ["Pizza", "Sushi", "Wok"]; empty → []. */
export function cleanCategory(raw: string | null | undefined): string[] {
  const value = raw?.trim().replace(/\s+/g, " ");
  if (!value) return [];
  const parts = SPLIT_AS[value.toLowerCase()] ?? value.split(/\s*(?:,|\/|\band\b)\s*/i);
  return [...new Set(parts.filter((p) => p.trim()).map(canonical))];
}
