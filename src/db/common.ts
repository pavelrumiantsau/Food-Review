export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Builds `UPDATE <table> SET col = ?, … WHERE id = ?` for the keys present in `patch`.
 * Keys must come from a validated schema — they are interpolated as column names.
 */
export function updateStatement(
  db: D1Database,
  table: string,
  id: number,
  patch: Record<string, unknown>,
  extraSet: string[] = [],
): D1PreparedStatement | null {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  const sets = [...keys.map((k) => `${k} = ?`), ...extraSet];
  if (keys.length === 0) return null;
  return db
    .prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...keys.map((k) => patch[k] ?? null), id);
}

/** Splits a group_concat(…, char(31)) result. */
export function splitList(value: string | null): string[] {
  return value ? value.split("\x1f").sort((a, b) => a.localeCompare(b)) : [];
}

/** Thrown for input that passes schema validation but conflicts with stored data; the API returns 400. */
export class InvalidInput extends Error {}
