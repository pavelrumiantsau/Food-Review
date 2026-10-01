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
| `npm test` | Unit tests |
| `npm run typecheck` | Type-check Worker, tests and Mini App |
