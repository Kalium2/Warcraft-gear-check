# Loot Ledger — WoW: Forever Armory

A single static page (`index.html`) for looking up World of Warcraft: Forever characters with the official Blizzard Battle.net API.

## How requests reach Blizzard
By default, every request goes through a small Cloudflare Worker (`worker/worker.js`, route `GET /api/blizzard`). The worker holds the Blizzard client secret, adds the OAuth token, and passes through only an allowlisted set of read-only paths (character profiles, realms, items, item icons, guilds), so visitors need no credentials. It only sends CORS headers for the origins in `ALLOWED_ORIGINS` (default `https://kalium2.github.io`).

The site never asks visitors for Blizzard credentials; the worker is the only route to the API. Its URL can be changed under **Advanced**.

## Deploying the worker
The worker config is `wrangler.jsonc` at the repo root (code in `worker/worker.js`), so Cloudflare's Git integration can build from the repo root with deploy command `npx wrangler deploy`. Set two secrets on the worker: `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`.

Check it with `https://warcraft-gear-check.lambertdaniel26.workers.dev/health`, which should return `{"ok":true,"credentials":true}`. If the worker URL is different, update `DEFAULT_WORKER_URL` in `index.html`.

## How it works
- **Realms:** Forever hides realms, so by default the page loads the realm index (`dynamic-forever-{region}`) and checks every realm for the name. If several characters match, you pick one.
- **Data:** It loads the character summary, follows every profile link the summary returns, and also tries a list of known endpoints (equipment, statistics, talents, professions, reputations, raids/dungeons, achievements, PvP, titles, collections, quests and more). Sections with a known layout get a dedicated view. Anything else is shown with a generic viewer, and the full raw JSON can be downloaded.
- **Namespaces:** Blizzard hasn't documented the Forever API yet. The defaults (`profile-forever-{region}`, `dynamic-forever-{region}`) come from community testing and can be changed under **Advanced** without touching code.
- **Links:** `#region/realm/name` links open a character directly.
