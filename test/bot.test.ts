import type { Bot } from "grammy";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getBot } from "../src/bot";
import { createPlace } from "../src/db/places";
import { createProduct } from "../src/db/products";
import { OWNER_ID, setupDb } from "./helpers";

const APP = "https://app.example";
let t: Awaited<ReturnType<typeof setupDb>>;
let bot: Bot;
let calls: { method: string; payload: any }[] = [];

beforeAll(async () => {
  t = await setupDb();
  bot = getBot(t.env, APP);
  // Capture Bot API calls instead of sending them to Telegram.
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "getMe") {
      return { ok: true, result: { id: 1, is_bot: true, first_name: "Food", username: "food_bot" } } as any;
    }
    calls.push({ method, payload });
    return { ok: true, result: true } as any;
  });
  await bot.init();
});
afterAll(() => t.dispose());
beforeEach(async () => {
  calls = [];
  await t.reset();
  vi.unstubAllGlobals();
});

let updateId = 0;
function send(text: string, fromId = OWNER_ID) {
  return bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: fromId, type: "private", first_name: "T" },
      from: { id: fromId, is_bot: false, first_name: "T" },
      text,
      ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] } : {}),
    },
  });
}

const replies = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.payload);
const buttons = (payload: any) => payload.reply_markup.inline_keyboard.flat().map((b: any) => [b.text, b.web_app.url]);

/** Fake fetch for Google redirects and OpenStreetMap. */
function stubMaps(location: string) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://maps.app.goo.gl/")) return new Response(null, { status: 302, headers: { location } });
    if (url.startsWith("https://nominatim.openstreetmap.org/")) {
      return Response.json({ address: { road: "Didžioji g.", house_number: "16", city: "Vilnius" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

const MAPS = "https://www.google.com/maps/place/Amatinink%C5%B3+u%C5%BEeiga/@54.67,25.28,17z/data=!3d54.6797!4d25.2881";

describe("bot", () => {
  it("ignores other users", async () => {
    await send("pizza", 999);
    expect(calls).toEqual([]);
  });

  it("searches ratings from plain text", async () => {
    await createPlace(t.db, { name: "Bočiai", categories: ["Lithuanian"], rating: 9 });
    await send("bociai");
    const [reply] = replies();
    expect(reply.text).toBe("🍽 Bočiai — <b>9/10</b> · Lithuanian");
    expect(buttons(reply)[0]).toEqual(["Open Bočiai", expect.stringMatching(/^https:\/\/app\.example\/place\/\d+$/)]);
  });

  it("shows your own rating for a known barcode", async () => {
    const p = await createProduct(t.db, { name: "Kefir", barcode: "4770000000017", rating: 7 });
    await send("4770000000017");
    const [reply] = replies();
    expect(reply.text).toContain("Rating: <b>7/10</b>");
    expect(buttons(reply)).toEqual([["Open in app", `${APP}/product/${p.id}`]]);
  });

  it("offers to add a place shared from Google Maps", async () => {
    stubMaps(MAPS);
    await send("Amatininkų užeiga\nhttps://maps.app.goo.gl/AbC");
    const [reply] = replies();
    expect(reply.text).toBe("📍 <b>Amatininkų užeiga</b>\nDidžioji g. 16\nNot in your list yet.");
    expect(buttons(reply)).toEqual([["Add place", `${APP}/place/new?map_url=${encodeURIComponent("https://maps.app.goo.gl/AbC")}`]]);
  });

  it("offers to save the location of an existing place without one", async () => {
    stubMaps(MAPS);
    const place = await createPlace(t.db, { name: "Amatininkų užeiga", rating: 10 });
    await send("https://maps.app.goo.gl/AbC");
    const [reply] = replies();
    expect(reply.text).toContain("Already in your list");
    expect(reply.text).toContain("It has no location yet.");
    expect(buttons(reply).map(([label]: string[]) => label)).toEqual(["Open", "Save location"]);
    expect(buttons(reply)[1][1]).toBe(`${APP}/place/${place.id}/edit?map_url=${encodeURIComponent("https://maps.app.goo.gl/AbC")}`);
  });
});
