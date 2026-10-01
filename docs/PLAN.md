# Food-Review — Requirements & Development Plan

## 1. Requirements

### Functional
| # | Requirement | Notes |
|---|---|---|
| F1 | Rate products on a **1–10** scale (**whole numbers only**) with an optional short review | |
| F2 | **Scan barcodes** and use them (together with the product name) to identify a product | Some products have no barcode (bakery, by-weight), and a barcode can be reused, so the barcode is a lookup key, not the primary key |
| F3 | Auto-fill name/brand/image from the barcode | Open Food Facts (free, no API key). **Food products only** |
| F4 | **Search** for "what did I give this?" by name, brand, barcode, category or tag | Full-text search, with Cyrillic support |
| F5 | Optional **photos** for products and places | |
| F6 | **Restaurants/places**: name, categories (cuisines), overall rating (may be empty) | |
| F6a | **Add and delete places** from both the bot and the Mini App | Many places in the Excel list may have closed since. Deleting asks for confirmation |
| F7 | Places also have: city/address/map link, **visit history** (dated visits with their own rating and notes), **dishes tried** (each rated), price level, tags | |
| F8 | **Import the existing Excel file** of places | One-off import, see §6a |
| F9 | **Data portability**: full export and regular backups | So the app can be redesigned or replaced later |

### Non-functional
- Main devices: **iPhone + Telegram**. No App Store, no separate login.
- **Free** hosting only, reusing the **Cloudflare** account you already have.
- Single user: only your Telegram ID can use it.
- **UI language: English.** Content (names, notes) can be in any language. Search handles Lithuanian (ė, š, ų…) and Cyrillic.
- Quick capture: scanning and rating a product should take under 15 seconds.

## 2. Architecture

```
 iPhone / Telegram
 ├── Chat with bot ──────────────┐  (webhook)
 └── Mini App (web UI in TG) ────┤  (HTTPS, auth = Telegram initData)
                                 ▼
               Cloudflare Worker (TypeScript, single deployment)
               ├── /bot      grammY bot webhook
               ├── /api/*    REST API for the Mini App
               ├── /*        Mini App static files (Workers Static Assets)
               └── cron      weekly backup → sent to you in Telegram
                    │              │                 │
                    ▼              ▼                 ▼
             D1 (SQLite)     R2 (photos)     Open Food Facts API
```

### Why this stack
| Piece | Choice | Free tier (approx.) | Reason |
|---|---|---|---|
| Compute | Cloudflare Workers | 100k req/day, 10 ms CPU/request | Already on Cloudflare, never sleeps (unlike Render or Supabase's pause after 7 idle days), webhooks fit well |
| DB | **D1** (SQLite) | 5 GB, 5M row reads/day | Standard SQL, exportable as `.sql`/CSV |
| Photos | **R2** | 10 GB, no egress fees | Works with the S3 API, so it's easy to migrate |
| Frontend | Vite + React + TS, Telegram theme | Served by the Worker | Native look inside Telegram |
| Bot lib | grammY | – | Runs on Workers |
| DB access | Plain SQL (D1 prepared statements) + zod validation | – | Migrations are ordinary `.sql` files, so they carry over to any SQLite/Postgres |

**Portability:** all data is in standard SQLite plus S3-style object storage. There are three ways to get it out:
`wrangler d1 export` (full SQL dump), the in-app `/export` (JSON + CSV + photo ZIP), and the weekly cron backup.

### Barcode scanning (main technical risk)
- Telegram's built-in scanner (`showScanQrPopup`) only reads **QR codes**, not EAN/UPC.
- The 10 ms CPU limit on Workers makes **server-side** decoding of photos unreliable, so decoding happens **on the phone, in the Mini App**:
  1. Preferred: live camera (`getUserMedia`) + `zxing-wasm`, decoding continuously.
  2. Fallback: `<input type="file" accept="image/*" capture="environment">` takes a photo, which is decoded in the browser.
  3. Always possible: type the digits manually, or send them to the bot as text.
- Phase 0 includes a spike to check that option 1 works in Telegram iOS.

### Auth
- Mini App: validate Telegram `initData` with an HMAC check against the bot token, then compare `user.id` to the `OWNER_TELEGRAM_ID` secret. The Worker issues a short-lived signed session token, which is also used for photo URLs.
- Bot webhook: `X-Telegram-Bot-Api-Secret-Token` header check; messages from anyone other than you are ignored.

## 3. Data model (D1)

```sql
products(id, barcode NULL, name, brand, category, rating 1-10, review,
         off_image_url, source, created_at, updated_at)
  -- index on barcode (not unique); unique(barcode, name)

places(id, name, city DEFAULT 'Vilnius', address, map_url, website, lat, lng,
       price_level 1-4,
       rating 1-10 NULL,         -- overall rating; NULL = not rated yet
       rating_imported BOOL,     -- true = converted from the old 5-point scale, not reviewed yet
       notes, created_at, updated_at)
categories(id, name UNIQUE)      -- cuisines: "Italian", "Sushi", ...
place_categories(place_id, category_id)

visits(id, place_id, visited_on, rating 1-10, notes, created_at)
dishes(id, place_id, visit_id NULL, name, rating 1-10, notes, created_at)

tags(id, name UNIQUE)
entity_tags(tag_id, entity_type, entity_id)       -- 'product' | 'place'
photos(id, entity_type, entity_id, r2_key, width, height, created_at)
      -- entity_type: 'product' | 'place' | 'visit' | 'dish'

-- products.search_text / places.search_text: lower-cased, diacritic-free copy of the
-- searchable fields (incl. categories, tags, dish names), maintained by the app.
-- Not FTS5: `wrangler d1 export` can't export databases with virtual tables.
```

Decisions:
- **Overall place rating** is a stored field. When a visit is added, the bot offers to update it ("Overall is 7, this visit is 9. Update overall?"). The average of visits is shown next to it.
- All ratings are `INTEGER CHECK (rating BETWEEN 1 AND 10)`.
- Setting a rating on a place clears `rating_imported`. A **"Re-rate imported"** filter lists the places still flagged.
- Deleting a place cascades to its visits, dishes, tags and photos (including the R2 objects), after a confirmation step.
- Photos are resized on the phone (max 1600 px, JPEG/WebP ~80%) before upload, which keeps R2 usage small.

## 4. User flows

**Bot (quick actions)**
- `/start` shows a short help text and the **menu button** that opens the Mini App.
- Any text is a search across products and places. Results come back as short cards with inline buttons (*Open*, *Edit rating*).
- Sending digits only (e.g. `4601234567890`) looks up that barcode. If it's found, the bot shows the card; if not, it shows the Open Food Facts info with a **Rate it** button, i.e. 1–10 inline keyboard → optional review.
- A photo with caption `#place Name` or `#product Name` gets attached to that item.
- `/export` sends a JSON + CSV backup as files. `/scan` shows a button that opens the Mini App scanner.

**Mini App**
- **Home**: search bar, tabs *Products / Places*, recent items, filters (rating ≥ N, category, city, tag), sort.
- **Scan**: camera to barcode to product card. Existing product shows the rating at a glance; a new one is auto-filled and opens the rating form.
- **Product**: rating slider (1–10), review, tags, photos.
- **Place**: info, categories, map link, overall rating, visit timeline, dishes list, photos. Add visit / Add dish / Edit / **Delete**.
- **Places list** filters: rated / unrated, *Re-rate imported*, category, rating ≥ N.
- **Settings**: export, import, stats (counts, average ratings, top categories).

## 5. Repository layout

```
/src
  index.ts            Worker entry: routes /bot, /api, assets, cron
  bot/                grammY handlers
  api/                REST handlers (Hono)
  db/                 SQL data access (products, places, search, taxonomy)
  lib/                auth (initData), off-lookup, r2, export
/migrations           0001_init.sql, ...
/webapp               Vite + React Mini App (builds to webapp/dist)
/scripts
  import-excel.ts     xlsx → SQL for D1
/data                 your Excel file (git-ignored)
/test                 vitest + @cloudflare/vitest-pool-workers
wrangler.jsonc
```

## 6. Phases

### Phase 0 — Setup and spikes (½ day)
- [x] Create the bot in @BotFather and register the Mini App URL (`/newapp`) and menu button.
- [x] Scaffold the Worker + Vite app, `wrangler.jsonc`, D1 database (`food-review`). *R2 bucket deferred to Phase 2: R2 must be enabled in the Cloudflare dashboard first.* Secrets (`BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `WEBHOOK_SECRET`).
- [x] **Spike**: a minimal Mini App page with `zxing-wasm` live scanning, tested in Telegram on your iPhone. Choose live camera or the photo fallback. **Result: live camera works in Telegram iOS. Photo and typed digits are kept as fallbacks.**
- [x] Deploy with `wrangler deploy`: https://food-review.p-rumiantsau.workers.dev. Optional: GitHub Actions auto-deploy on push to `main`.

### Phase 1 — Core backend
- [x] Migration `0001_init.sql` (schema above, normalised `search_text` columns).
- [x] `initData` auth middleware, owner-only guard, webhook secret check.
- [x] CRUD API for products, places, visits, dishes, tags, and search endpoint.
- [x] Bot: `/start`, text search, barcode-digits lookup.
- [x] Tests for auth, search, rating validation (vitest + local D1 via `getPlatformProxy`).

### Phase 2 — Products
- [ ] Open Food Facts lookup, cached in `products`.
- [x] Mini App: Scan screen, product card/form, rating control.
- [ ] Bot: 1–10 inline rating keyboard, optional review step.
- [ ] Photo upload: resized on the phone, then sent to R2, served through signed URLs.

### Phase 3 — Places + Excel import
- [x] Mini App: place list/detail/form, visits, dishes, categories, tags, price level, delete.
- [x] `scripts/import-excel.ts` (see §6a): dry-run report first, then idempotent SQL loaded with `wrangler d1 execute`. **Imported 2026-10-01: 382 places, 179 rated (flagged), 67 categories.**
- [ ] Bot: `/addplace <name>` and delete with a confirmation button.
- [ ] Bot: add a quick visit from chat (`/visit <place>` → rating → note).

### Phase 4 — Search and polish
- [ ] Search tuning, filters, sorting, "best rated in category X".
- [ ] Stats screen.
- [ ] Empty/error states, haptic feedback, Telegram theme colours.

### Phase 5 — Portability and backup
- [x] `/export`: JSON (whole DB, restorable with `scripts/restore.ts`) + CSVs. *Photos: add once R2 is enabled.*
- [x] Weekly cron, which sends the backup file to your Telegram chat (Mondays 06:00 UTC).
- [x] Document migrating elsewhere in the README.

### Later / nice-to-have
- Inline mode (`@yourbot snickers` in any chat, to share a rating).
- "Near me": sort places by distance (Telegram `LocationManager`).
- Paste a Google Maps link, which auto-fills name/address/coordinates.
- Rating history for products (re-tasting over time).

## 6a. Excel import spec (`data/Vilnius restaurants.xlsx`)

Source: sheet **`Viso`** (382 places). Sheet `Not tested` duplicates the 203 unrated rows, so it is ignored.

| Excel column | → App field | Rule |
|---|---|---|
| A `Restaurant` | `places.name` | Trim whitespace; hyperlink (1 row) → `website` |
| B `Rating (out of 5)` | `places.rating` | **×2** (5→10, 4→8, 3→6, 2→4) with `rating_imported = true`; empty → `NULL` (unrated, 203 rows) |
| C `Category` | `categories` | Cleaned and split, see below; empty (1 row) → no category |
| D (unnamed notes) | `places.notes` | 3 rows, kept as written |
| E, F (`Checked` / count formula) | – | Ignored |
| – | `city` | `Vilnius` |

Category clean-up (86 raw values → about 60):
- **Spelling**: Chineese→Chinese, Japaneese→Japanese, Vietnameese→Vietnamese, Portugeese→Portuguese, Vegeterian→Vegetarian, Chiken→Chicken, Deserts→Desserts, Pasteries→Pastries; trim trailing spaces.
- **Merge**: Burger→Burgers, Middle-eastern→Middle eastern, Boba→Bubble tea.
- **Rename**: `Overall` → **General** (mixed menu, 53 places).
- **Split** on `and` / `,` / `/`: "Kebab and pizza" → Kebab + Pizza; "Pizza, sushi and wok" → Pizza + Sushi + Wok; "Breakfast / Coffee" → Breakfast + Coffee; "Vegeterian pizza" → Vegetarian + Pizza.
- Other names are kept as written (Sakartvelian, Blynai, Šašlykas, Kepyklėlė, Kibinai, For beer…).
- The mapping is kept in `scripts/category-map.ts` so it can be edited. The dry run prints raw → cleaned for every value before anything is written.

## 7. Decisions
| Question | Decision |
|---|---|
| Rating granularity | Whole numbers 1–10 |
| UI language | English |
| Product scope | Food only (Open Food Facts) |
| Excel 5-point ratings | ×2, flagged for review |
| Unrated places | Imported with an empty rating (no separate "want to try" status) |
| `Overall` category | Becomes **General** |
| Category clean-up | Fix spelling, merge, split combos |
