/**
 * SQL literal for generated scripts. Line breaks become `char(10)` / `char(13)` so every
 * statement stays on one line (D1's exec splits on newlines).
 */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  const parts = String(v)
    .split(/(\r|\n)/)
    .filter((p) => p !== "")
    .map((p) => (p === "\n" ? "char(10)" : p === "\r" ? "char(13)" : `'${p.replace(/'/g, "''")}'`));
  return parts.length === 0 ? "''" : parts.length === 1 ? parts[0] : `(${parts.join(" || ")})`;
}
