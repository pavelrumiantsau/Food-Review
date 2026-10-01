// Turns a JSON backup (from /export or the weekly backup) into SQL that recreates all data.
//
//   node scripts/restore.ts food-review-2026-10-01.json data/restore.sql
//   npx wrangler d1 migrations apply <db> --remote          # on a new, empty database
//   npx wrangler d1 execute <db> --remote --file data/restore.sql
//
// Row ids are preserved, so the target database must be empty (only migrations applied).
import { readFileSync, writeFileSync } from "node:fs";
import { TABLES } from "../src/db/tables.ts";
import { sqlLiteral } from "./sql.ts";

interface Backup {
  app: string;
  version: number;
  exported_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export function toRestoreSql(backup: Backup): string {
  if (backup.app !== "food-review" || backup.version !== 1) {
    throw new Error(`Unsupported backup: app=${backup.app} version=${backup.version}`);
  }
  const lines = [`-- Restore of Food Review backup exported at ${backup.exported_at}. Target must be empty.`];
  for (const table of TABLES) {
    for (const row of backup.tables[table] ?? []) {
      const columns = Object.keys(row);
      lines.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => sqlLiteral(row[c])).join(", ")});`);
    }
  }
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const [input, output = "data/restore.sql"] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: node scripts/restore.ts <backup.json> [output.sql]");
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(input, "utf8")) as Backup;
  writeFileSync(output, toRestoreSql(backup));
  const counts = TABLES.map((t) => `${t} ${backup.tables[t]?.length ?? 0}`).join(", ");
  console.log(`Wrote ${output} (${counts})`);
}
