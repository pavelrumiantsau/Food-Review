// End-to-end click-through of the Mini App in headless Chrome.
// Starts its own `wrangler dev` with a throwaway D1 and test credentials, seeds sample data
// through the API, then drives the UI the way Telegram would (signed initData in the URL hash).
//
//   npm run e2e            (CHROME_PATH overrides the Chrome location)
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const PORT = 8798;
const BASE = `http://localhost:${PORT}`;
const TOKEN = "E2E_TEST_TOKEN";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const dir = mkdtempSync(join(tmpdir(), "food-review-e2e-"));
writeFileSync(join(dir, "test.env"), `BOT_TOKEN=${TOKEN}\nOWNER_TELEGRAM_ID=42\nWEBHOOK_SECRET=x\n`);
execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "food-review", "--local", "--persist-to", dir], { stdio: "ignore" });
const server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", dir, "--env-file", join(dir, "test.env")], {
  stdio: "ignore",
  detached: true,
});

let browser;
let failed = 0;
try {
  await waitForServer();
  const initData = signInitData();
  await seed(initData);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  await run(browser, initData);
} finally {
  await browser?.close().catch(() => {});
  process.kill(-server.pid);
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

function signInitData() {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 42, first_name: "E2E" }) };
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler dev did not start");
}

async function seed(initData) {
  const post = (path, body) =>
    fetch(`${BASE}/api${path}`, {
      method: "POST",
      headers: { Authorization: `tma ${initData}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  await post("/places", { name: "Aardvark Bistro", categories: ["Lithuanian"], rating: 8 });
  await post("/places", { name: "Bravo Pizza", categories: ["Pizza"], lat: 54.6872, lng: 25.2797 });
  await post("/places", { name: "Charlie Grill", categories: ["BBQ"], lat: 54.7, lng: 25.3 });
  // Enough rows to scroll.
  for (let i = 1; i <= 40; i++) await post("/places", { name: `Place ${String(i).padStart(2, "0")}`, categories: ["General"], rating: i === 1 ? 6 : undefined });
  // Mark two places as imported from the old 5-point list.
  execFileSync("npx", ["wrangler", "d1", "execute", "food-review", "--local", "--persist-to", dir,
    "--command", "UPDATE places SET rating_imported = 1 WHERE name IN ('Aardvark Bistro', 'Place 01')"], { stdio: "ignore" });
}

async function run(browser, initData) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Telegram's showConfirm talks to the native client; auto-confirm instead.
  // Play the native Telegram client for location requests: a fixed spot in Vilnius Old Town.
  await page.evaluateOnNewDocument(() => {
    const reply = (type, data) => setTimeout(() => window.Telegram.WebView.receiveEvent(type, data), 10);
    window.TelegramWebviewProxy = {
      postEvent(type) {
        if (type === "web_app_check_location") reply("location_checked", { available: true, access_requested: true, access_granted: true });
        if (type === "web_app_request_location") reply("location_requested", { available: true, latitude: 54.6869, longitude: 25.2795 });
      },
    };
  });
  await page.evaluateOnNewDocument(() => {
    const iv = setInterval(() => {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm = (_m, cb) => setTimeout(() => cb(true), 10);
        clearInterval(iv);
      }
    }, 5);
  });

  const hash = `#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=ios`;
  const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));
  const text = () => page.evaluate(() => document.body.innerText);
  const onHome = async () => (await page.$(".search")) !== null;
  const click = async (selector, label) => {
    const found = await page.evaluate(
      (selector, label) => {
        const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.trim().startsWith(label));
        el?.click();
        return !!el;
      },
      selector,
      label,
    );
    if (!found) throw new Error(`No ${selector} starting with "${label}"`);
    await wait();
  };
  const back = async () => {
    await page.evaluate(() => window.Telegram.WebView.receiveEvent("back_button_pressed"));
    await wait();
  };
  const check = (name, ok) => {
    console.log(`${ok ? "✓" : "✗"} ${name}`);
    if (!ok) failed++;
  };

  await page.goto(BASE + "/" + hash);
  await page.waitForSelector(".list li");

  await click(".list li", "Aardvark Bistro");
  check("opens a place from the list", (await text()).includes("Converted from your 5-point list"));
  await back();
  check("Back returns to the list", await onHome());

  // Scroll position survives opening a place and going Back, with the list drawn immediately.
  await page.evaluate(() => window.scrollTo(0, 1200));
  await wait(200);
  const scrolled = await page.evaluate(() => window.scrollY);
  await click(".list li", "Place 30");
  check("opening a place starts at the top", (await page.evaluate(() => window.scrollY)) === 0);
  await page.evaluate(() => window.Telegram.WebView.receiveEvent("back_button_pressed"));
  await wait(50); // before any network refresh could finish
  const after = await page.evaluate(() => ({ y: window.scrollY, rows: document.querySelectorAll(".list li").length }));
  check(`Back restores scroll (${scrolled} → ${after.y}) with the list already drawn (${after.rows} rows)`, Math.abs(after.y - scrolled) < 5 && after.rows >= 40);
  await page.evaluate(() => window.scrollTo(0, 0));

  await click(".list li", "Aardvark Bistro");
  await click(".rating-picker button", "9");
  check("re-rating clears the imported flag", !(await text()).includes("Converted from your 5-point list"));

  await click("button", "+ Add visit");
  await click(".inline-form .rating-picker button", "7");
  await click("button", "Save visit");
  check("adds a visit", /Visits \(1\)/i.test(await text()));

  await click("button", "+ Add dish");
  await page.type(".inline-form input", "Šaltibarščiai");
  await click("button", "Save dish");
  check("adds a dish", (await text()).includes("Šaltibarščiai"));

  await click("button", "Edit details");
  await page.evaluate(() =>
    [...document.querySelectorAll(".field")].find((f) => f.textContent.startsWith("Address")).querySelector("input").focus(),
  );
  await page.keyboard.type("Gedimino pr. 1");
  await click("button", "Save");
  check("edit saves and returns to the place", (await text()).includes("Gedimino pr. 1"));
  await back();
  check("Back after edit returns to the list", await onHome());

  await click("button", "📊");
  check("stats screen shows tiles and a histogram", (await page.$(".tile")) !== null && (await page.$(".histogram .bar")) !== null);
  await click("button", "1 imported ratings to review");
  check("stats links to the imported-ratings filter", (await page.$$eval(".chip.active", (e) => e.map((x) => x.textContent))).includes("Re-rate imported"));
  await click(".chip", "All");

  await page.select(".filters select:last-child", "distance");
  await wait(1000);
  const nearest = await page.$$eval(".list li", (rows) => rows.map((r) => r.innerText.replace(/\s+/g, " ")));
  check(
    `"Nearest" lists only located places, closest first (${nearest.join(" | ")})`,
    nearest.length === 2 && nearest[0].startsWith("Bravo Pizza") && /\d+ m/.test(nearest[0]) && /km/.test(nearest[1]),
  );
  await page.select(".filters select:last-child", "name");
  await wait(500);

  await page.type(".search", "saltibarsciai");
  await wait(1200);
  check("search finds a dish without diacritics", (await text()).includes("Aardvark Bistro"));
  await click(".list li", "🍽");
  await click("button", "Delete place");
  check("delete returns home and the place is gone", (await onHome()) && !(await text()).includes("Aardvark Bistro"));

  await page.goto(BASE + "/scan" + hash);
  await page.waitForSelector("form input");
  await page.type("form input", "3017620422003");
  await click("button", "Go");
  const prefilled = await page
    .waitForFunction(() => document.querySelector(".field input")?.value === "Nutella", { timeout: 15000 })
    .then(() => true, () => false);
  check("scanned barcode opens a prefilled new product", prefilled);
  await click(".rating-picker button", "8");
  await click("button", "Add product");
  check("product is saved", /\/product\/\d+$/.test(page.url()));
  await click(".rating-picker button", "9");
  await click("button", "Save");
  check("re-rating a product keeps its history", /History:\s*8 \S+ → 9/.test(await text()));
  await back();
  check("Back from a deep link goes home", await onHome());

  const mapsLink =
    "https://www.google.com/maps/place/Amatinink%C5%B3+u%C5%BEeiga/@54.6795,25.2858,17z/data=!3m1!4b1!8m2!3d54.6797212!4d25.2881938";
  await page.goto(`${BASE}/place/new?map_url=${encodeURIComponent(mapsLink)}${hash}`);
  await wait(3000); // Nominatim lookup
  const filled = await page.$$eval(".field input", (inputs) => inputs.map((i) => i.value));
  check(`a Google Maps link fills name and address (${filled.slice(0, 1)}, ${filled.find((v) => /\d/.test(v) && !v.startsWith("http"))})`,
    filled[0] === "Amatininkų užeiga" && (await text()).includes("Location saved from Google Maps"));
  await click("button", "Add place");
  check("the new place has a map link", (await text()).includes("Map"));

  check(`no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
}
