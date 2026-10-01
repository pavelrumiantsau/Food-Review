import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../src/env";

export const BOT_TOKEN = "123456:TEST-TOKEN";
export const OWNER_ID = 42;

const TABLES = ["dishes", "visits", "place_categories", "place_tags", "product_tags", "places", "products", "categories", "tags"];

/** Local in-memory D1 with all migrations applied. */
export async function setupDb() {
  const proxy = await getPlatformProxy<Env>({ persist: false });
  const db = proxy.env.DB;
  const dir = join(import.meta.dirname, "../migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    // D1's exec() splits on newlines, so run statement by statement.
    const statements = readFileSync(join(dir, file), "utf8")
      .replace(/--.*$/gm, "")
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  return {
    db,
    env: { DB: db, BOT_TOKEN, OWNER_TELEGRAM_ID: String(OWNER_ID), WEBHOOK_SECRET: "secret" } satisfies Env,
    reset: () => db.batch(TABLES.map((t) => db.prepare(`DELETE FROM ${t}`))),
    dispose: proxy.dispose,
  };
}

/** Signs initData the same way Telegram does. */
export function signInitData(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function authHeader(userId = OWNER_ID): Record<string, string> {
  const initData = signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Test" }),
  });
  return { Authorization: `tma ${initData}` };
}
