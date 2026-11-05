# Loot Ledger — WoW: Forever Armory

A single static page (`index.html`) for looking up World of Warcraft: Forever characters with the official Blizzard Battle.net API.

## How requests reach Blizzard
By default, every request goes through a small Cloudflare Worker (`worker/worker.js`, route `GET /api/blizzard`). The worker holds the Blizzard client secret, adds the OAuth token, and passes through only an allowlisted set of read-only paths (character profiles, realms, items, item icons, guilds), so visitors need no credentials. It only sends CORS headers for the origins in `ALLOWED_ORIGINS` (default `https://kalium2.github.io`).

If the worker is unavailable, a visitor can expand **Use your own Blizzard API credentials** and enter their own client ID/secret (from https://develop.battle.net/access/clients) or paste a token; the browser then calls Blizzard directly. The worker URL can be changed under **Advanced**.

## Deploying the worker
```bash
cd worker
npx wrangler deploy
npx wrangler secret put BLIZZARD_CLIENT_ID
npx wrangler secret put BLIZZARD_CLIENT_SECRET
```
Check it with `https://warcraft-gear-check.<your-subdomain>.workers.dev/health`, which should return `{"ok":true,"credentials":true}`. If the worker URL isn't `https://warcraft-gear-check.lambertdaniel26.workers.dev`, update `DEFAULT_WORKER_URL` in `index.html`.

## How it works
- **Realms:** Forever hides realms, so by default the page loads the realm index (`dynamic-forever-{region}`) and checks every realm for the name. If several characters match, you pick one.
- **Data:** It loads the character summary, follows every profile link the summary returns, and also tries a list of known endpoints (equipment, statistics, talents, professions, reputations, raids/dungeons, achievements, PvP, titles, collections, quests and more). Sections with a known layout get a dedicated view. Anything else is shown with a generic viewer, and the full raw JSON can be downloaded.
- **Namespaces:** Blizzard hasn't documented the Forever API yet. The defaults (`profile-forever-{region}`, `dynamic-forever-{region}`) come from community testing and can be changed under **Advanced** without touching code.
- **Links:** `#region/realm/name` links open a character directly.
