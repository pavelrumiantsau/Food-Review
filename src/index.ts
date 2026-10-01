import { Api, webhookCallback } from "grammy";
import { Hono } from "hono";
import { api } from "./api";
import { getBot } from "./bot";
import type { Env } from "./env";
import { sendBackup } from "./lib/export";

export const app = new Hono<{ Bindings: Env }>();

app.post("/bot", (c) => {
  const bot = getBot(c.env, new URL(c.req.url).origin);
  return webhookCallback(bot, "hono", { secretToken: c.env.WEBHOOK_SECRET })(c);
});

app.route("/api", api);

export default {
  fetch: app.fetch,
  // Weekly backup (schedule in wrangler.jsonc): the same files as /export, sent to the owner.
  async scheduled(_controller, env) {
    await sendBackup(new Api(env.BOT_TOKEN), env.DB, Number(env.OWNER_TELEGRAM_ID), "Weekly Food Review backup");
  },
} satisfies ExportedHandler<Env>;
