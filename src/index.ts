import { webhookCallback } from "grammy";
import { Hono } from "hono";
import { api } from "./api";
import { getBot } from "./bot";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.post("/bot", (c) => {
  const bot = getBot(c.env, new URL(c.req.url).origin);
  return webhookCallback(bot, "hono", { secretToken: c.env.WEBHOOK_SECRET })(c);
});

app.route("/api", api);

export default app satisfies ExportedHandler<Env>;
