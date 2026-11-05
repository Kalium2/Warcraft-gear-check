# Loot Ledger — WoW: Forever Armory

A single static page (`index.html`) for looking up World of Warcraft: Forever characters with the official Blizzard Battle.net API.

## How requests reach Blizzard
By default, every request goes through the Cloudflare Worker at `https://wcgear.lambertdaniel26.workers.dev` (source: `Kalium2/WCgear`, `worker.js`, route `GET /api/blizzard`). The worker holds the Blizzard client secret, adds the OAuth token, and passes through only an allowlisted set of read-only paths, so visitors need no credentials. Its CORS origin is `https://kalium2.github.io`, so the page has to be served from GitHub Pages (or the worker's `ALLOWED_ORIGIN` changed) for browser calls to succeed.

If the worker is unavailable, a visitor can expand **Use your own Blizzard API credentials** and enter their own client ID/secret (from https://develop.battle.net/access/clients) or paste a token; the browser then calls Blizzard directly. The worker URL can be changed under **Advanced**.

## How it works
- **Realms:** Forever hides realms, so by default the page loads the realm index (`dynamic-forever-{region}`) and checks every realm for the name. If several characters match, you pick one.
- **Data:** It loads the character summary, follows every profile link the summary returns, and also tries a list of known endpoints (equipment, statistics, talents, professions, reputations, raids/dungeons, achievements, PvP, titles, collections, quests and more). Sections with a known layout get a dedicated view. Anything else is shown with a generic viewer, and the full raw JSON can be downloaded.
- **Namespaces:** Blizzard hasn't documented the Forever API yet. The defaults (`profile-forever-{region}`, `dynamic-forever-{region}`) come from community testing and can be changed under **Advanced** without touching code.
- **Links:** `#region/realm/name` links open a character directly.
