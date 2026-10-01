# Food-Review
There is so much food around that it's hard to remember everything. Well, let's fix that!

Personal 1–10 ratings for food products (barcode scanning) and restaurants, as a Telegram bot + Mini App
on Cloudflare Workers + D1. See [docs/PLAN.md](docs/PLAN.md).

## Setup

```sh
npm install
npx wrangler login
cp .dev.vars.example .dev.vars        # fill in BOT_TOKEN, OWNER_TELEGRAM_ID, WEBHOOK_SECRET
npx wrangler secret bulk .dev.vars    # upload secrets to the Worker
npm run deploy
npm run set-webhook -- https://food-review.<subdomain>.workers.dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run deploy` | Build the Mini App and deploy the Worker |
| `npm run set-webhook -- <url>` | Point the bot webhook and menu button at the Worker |
| `npm test` | Unit and API tests (local D1) |
| `npm run e2e` | Headless-Chrome click-through of the Mini App against a throwaway local Worker |
| `npm run import:excel` | Dry-run report + `data/import.sql` from the old Excel list |
| `npm run typecheck` | Type-check Worker, tests and Mini App |

## Backups and moving the data elsewhere

- **`/export`** in the bot sends `food-review-<date>.json` (every table, restorable) plus CSVs
  (`places`, `products`, `visits`, `dishes`) that open directly in Excel.
- The same files arrive **automatically every Monday** (cron `0 6 * * 1` in `wrangler.jsonc`).
- **Full SQL dump:** `npx wrangler d1 export food-review --remote --output backup.sql`.

Restore a JSON backup into a new, empty D1 database:

```sh
npx wrangler d1 create food-review-restored
npx wrangler d1 migrations apply food-review-restored --remote
node scripts/restore.ts food-review-2026-10-01.json data/restore.sql
npx wrangler d1 execute food-review-restored --remote --file data/restore.sql
```

The data is plain SQLite (see `migrations/`), so the dump also loads into any SQLite or,
with minor type changes, Postgres.
