// Registers the Worker as the bot's webhook and sets the Mini App menu button.
// Usage: npm run set-webhook -- https://food-review.<subdomain>.workers.dev
// Reads BOT_TOKEN and WEBHOOK_SECRET from .dev.vars (never printed).
import { readFileSync } from "node:fs";

const origin = process.argv[2]?.replace(/\/$/, "");
if (!origin?.startsWith("https://")) {
  console.error("Usage: npm run set-webhook -- https://<your-worker-url>");
  process.exit(1);
}

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!vars.BOT_TOKEN || !vars.WEBHOOK_SECRET) {
  console.error("BOT_TOKEN and WEBHOOK_SECRET must be set in .dev.vars");
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${vars.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(`${method}: ${json.ok ? "ok" : `FAILED — ${json.description}`}`);
  if (!json.ok) process.exitCode = 1;
}

await call("setWebhook", {
  url: `${origin}/bot`,
  secret_token: vars.WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query", "inline_query"],
  drop_pending_updates: true,
});
await call("setChatMenuButton", {
  menu_button: { type: "web_app", text: "Open", web_app: { url: origin } },
});
await call("setMyCommands", {
  commands: [
    { command: "start", description: "Open Food Review" },
    { command: "scan", description: "Scan a barcode" },
    { command: "export", description: "Send a backup of all data" },
  ],
});
