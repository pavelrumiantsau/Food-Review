import { Bot, InlineKeyboard } from "grammy";
import { findProductsByBarcode } from "../db/products";
import { search } from "../db/search";
import type { Env } from "../env";
import { sendBackup } from "../lib/export";
import { lookupBarcode } from "../lib/off";
import { escapeHtml, formatHit, formatProduct } from "./format";

const MAX_RESULTS = 10;

// One Bot per isolate, so getMe isn't called on every webhook request.
let cached: { token: string; bot: Bot } | undefined;

export function getBot(env: Env, webAppUrl: string): Bot {
  if (cached?.token === env.BOT_TOKEN) return cached.bot;
  const bot = new Bot(env.BOT_TOKEN);
  const ownerId = Number(env.OWNER_TELEGRAM_ID);
  const openApp = (label = "Open Food Review", path = "/") => new InlineKeyboard().webApp(label, webAppUrl + path);

  // Single-user app: silently ignore everyone else.
  bot.use(async (ctx, next) => {
    if (ctx.from?.id === ownerId) await next();
  });

  bot.command("start", (ctx) =>
    ctx.reply(
      "Send me a name to search your ratings, or barcode digits to look a product up.\nUse the app to scan and rate.",
      { reply_markup: openApp() },
    ),
  );

  bot.command("scan", (ctx) => ctx.reply("Tap to open the scanner:", { reply_markup: openApp("Scan barcode", "/scan") }));

  bot.command("export", async (ctx) => {
    await ctx.replyWithChatAction("upload_document");
    await sendBackup(ctx.api, env.DB, ctx.chat.id, "Food Review backup");
  });

  bot.hears(/^\d{8,14}$/, async (ctx) => {
    const barcode = ctx.message!.text!;
    const own = await findProductsByBarcode(env.DB, barcode);
    if (own.length) {
      return ctx.reply(own.map(formatProduct).join("\n\n"), {
        parse_mode: "HTML",
        reply_markup: openApp("Open in app", `/product/${own[0].id}`),
      });
    }
    const off = await lookupBarcode(barcode);
    const description = off
      ? `${escapeHtml(off.name ?? "(no name)")}${off.brand ? ` · ${escapeHtml(off.brand)}` : ""}`
      : "Unknown product";
    return ctx.reply(`Not rated yet.\nOpen Food Facts: <b>${description}</b>`, {
      parse_mode: "HTML",
      reply_markup: openApp("Rate it", `/product/new?barcode=${barcode}`),
    });
  });

  bot.on("message:text", async (ctx) => {
    const query = ctx.message.text;
    if (query.startsWith("/")) return ctx.reply("Unknown command. Try /start.");
    const hits = await search(env.DB, query, "all", MAX_RESULTS + 1);
    if (hits.length === 0) return ctx.reply(`Nothing found for “${query}”.`);
    const more = hits.length > MAX_RESULTS ? "\n\nMore results in the app." : "";
    const [first] = hits;
    return ctx.reply(hits.slice(0, MAX_RESULTS).map(formatHit).join("\n") + more, {
      parse_mode: "HTML",
      // A single match gets a direct link; otherwise open the app's search.
      reply_markup: hits.length === 1 ? openApp(`Open ${first.name}`, `/${first.kind}/${first.id}`) : openApp(),
    });
  });

  cached = { token: env.BOT_TOKEN, bot };
  return bot;
}
