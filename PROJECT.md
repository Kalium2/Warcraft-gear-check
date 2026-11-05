# Loot Ledger: WoW: Forever Armory (project handoff)

Context for picking this project up in a new chat. Current as of **2026-11-05**.

## What it is
A static, single-page site that looks up **World of Warcraft: Forever** characters with the official Blizzard Battle.net API and shows everything the API returns. It has no best-in-slot lists for now (removed on purpose).

- **Repo:** `Kalium2/Warcraft-gear-check`. `main` is live, and `claude/keen-goodall-kjc6bd` is the working branch (currently identical to `main`).
- **Site (GitHub Pages):** https://kalium2.github.io/Warcraft-gear-check/
- **API proxy (Cloudflare Worker):** https://warcraft-gear-check.lambertdaniel26.workers.dev
  - `GET /health` returns `{"ok":true,"credentials":true}` (confirmed working).
- **Reference only, do not modify:** `Kalium2/WCgear`. It's an older TBC gear tool with its own worker (`wcgear.lambertdaniel26.workers.dev`); its token-caching pattern was reused.

## Background: WoW: Forever
- New Blizzard game that launched **2026-11-04**: a level 1–60 adventure on the original continents with new zones, the Skyborne race and new class/race combos. Raids (Barrow Deeps, Hyjal Summit, Onyxia's Lair) open on 2026-12-09.
- **No visible realms.** Characters have a name plus a surname, and the realm is hidden (players pick a gameplay style instead: Normal, PvP, Roleplay, later Hardcore).

## Repo layout
```
index.html        The whole site (HTML + CSS + JS, no build step)
worker/worker.js  Cloudflare Worker: Blizzard API proxy
wrangler.jsonc    Worker config at the repo root (main = worker/worker.js, no assets)
README.md         Setup and deploy notes
```

## How the site works (`index.html`)
- **Search:**
  - Takes region (us/eu/kr/tw), realm and character name.
  - Realm defaults to **Auto-detect**: it loads the realm index and checks every realm for the name (8 requests at a time), then shows a picker if several characters match.
  - If you type "Name Surname", only the first word is used in the lookup; the surname narrows the matches if the API returns a surname-like field.
- **Data:**
  - Loads the character summary, follows every `href` link in it, and also tries a known list of endpoints: equipment, statistics, specializations, character-media, appearance, professions, reputations, titles, pvp-summary, achievements (plus achievement statistics), raid and dungeon encounters, collections (mounts, pets, toys, heirlooms, transmogs), hunter-pets, completed quests and mythic-keystone-profile.
- **Rendering:**
  - Dedicated layouts for the hero card (render image, title, level, item level, guild, faction and any extra summary fields such as a surname), gear (icons, quality colours, stats, enchants, sockets, set bonuses), stats, talents (Classic and Retail shapes), professions, reputations, raid/dungeon progress, achievements, titles and collections.
  - Anything else falls back to a generic viewer.
  - Endpoints that failed are listed under **Not Available**, and a **Raw JSON** panel offers copy and download.
- **Requests:**
  - By default they go through the worker: `GET {worker}/api/blizzard?region=&path=&namespace=&locale=`.
  - There is no way for visitors to use their own Blizzard credentials (removed on request). On load, the page deletes any `ll_creds` / `ll_token` / `ll_manual_token` an earlier version stored.
- **Settings (Advanced, saved in localStorage):**
  - Worker URL (default `DEFAULT_WORKER_URL`).
  - Namespaces: `profile-forever-{region}` and `dynamic-forever-{region}`.
  - Locale, and a manual realm slug.
- **Other:**
  - Deep links: `#region/realm/name`.
  - Recent searches are stored in localStorage.

## Visual design (Nov 2026 revamp)
- **Concept:** "a ledger of heroes".
  - Square hairline panels with gilded corner brackets, built from CSS gradients.
  - Dotted-leader fact rows, pointed (hexagonal) buttons, badges and chips, and a diamond sigil (`<symbol id="sigil">`) as the brand mark.
- **Type:** Cormorant Garamond (display), Instrument Sans (body), IBM Plex Mono (labels). Tokens live in `:root`; the old names (`--sepia`, `--gold-bright`, etc.) are aliased because generated markup uses them inline.
- **Interaction layer** (presentation only, in `enhanceResults()`):
  - pointer spotlight on cards (`.spot`, `--mx/--my`)
  - collapsible gear cards (click or Enter)
  - section reveal and bar fill on scroll
  - scrollspy on the sticky section nav
  - region segmented control that drives the hidden `#region` select
  - `/` focuses the name field
  - API status pill (`setApiState`: checking / live / waiting / down)
- **v3 armory components** (each takes a common WoW-site convention; no other site's branding is copied):
  - Class-tinted banner: hex crest, `--cls` set from the class colour, and stat tiles.
  - Sticky "On this page" sidebar on desktop; it becomes a top strip under 1000px.
  - Equipment paperdoll (`PD_LEFT` / `PD_RIGHT` / `PD_BOTTOM`) around the character model, with a "Full list" toggle.
  - In-game-style item tooltip (`#tt`, built by `itemLines` / `tooltipHTML`): follows the mouse on hover, pins as a sheet on touch or Enter.
  - Character sheet grouped by `STAT_GROUPS`.
  - Raid progress coloured by `rankColor` (grey → green → blue → purple → orange → gold); reputations in WoW standing colours (`STANDING_COLORS`).
- **Sample character** (`SAMPLE`, `openSample()`): fictional, labelled "Sample character" everywhere, never written to the URL hash or recent searches. Opened from the top nav, the empty state and the Forever-unavailable notice.
  - Its item icons use guessed Blizzard icon names (`render.worldofwarcraft.com/us/icons/56/<name>.jpg`); any that don't exist fall back to a diamond glyph.
- Reduced-motion is respected. Layout verified with no horizontal scroll at 320, 390, 768, 1024 and 1440px.

## Worker (`worker/worker.js`)
- **Routes:**
  - `GET /api/blizzard`: a read-only pass-through that adds the OAuth token. It returns Blizzard's status and body unchanged and caches successful replies (5 minutes for profiles, 1 hour for game data). If Blizzard returns 401, it gets a fresh token and retries once.
  - `GET /health`: reports whether the credentials are set.
- **Allowlisted paths:**
  - `/profile/wow/character/{realm}/{name}[/sub[/sub]]`
  - `/data/wow/realm/index`
  - `/data/wow/realm/{slug}`
  - `/data/wow/media/item/{id}`
  - `/data/wow/item/{id}`
  - `/data/wow/guild/{realm}/{name}[/roster|achievements|activity]`
- **Input checks:** `path` may be a full `https://xx.api.blizzard.com/...` href (host validated; namespace taken from its query). Region, namespace and locale are validated.
- **Secrets** (Cloudflare → worker → Settings → **Variables and Secrets**, *not* the Build variables): `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`.
- **CORS:** var `ALLOWED_ORIGINS` (in `wrangler.jsonc`), default `https://kalium2.github.io`. Opening `index.html` from disk won't work against the worker.
- **Deploy:** the Cloudflare Git integration builds `main` from the repo root with `npx wrangler deploy`.
  - The worker name must stay `warcraft-gear-check` to match the Cloudflare project.
  - If the build log ever says "Create wrangler.jsonc" or "Building list of assets", it isn't finding the root `wrangler.jsonc`.

## Current blocker: Blizzard isn't serving Forever data
- The site shows a plain-language notice: *"Blizzard isn't sharing WoW: Forever character data yet…"*. It appears on page load and on search whenever the realm index returns 404 (`FOREVER_UNAVAILABLE_MSG` in `index.html`). Other errors still mention the Advanced data-set name.
- **Cause: Blizzard's side, not our code.**
  - A public API-watch bot (github.com/Fredrik-Holmlund/hemmet.wtf_leveling, issues #2 and #3) saw `dynamic-forever-us` return **51 realms** (EU: 26) before launch.
  - On **2026-11-04** both switched to **404**, and `profile-forever-*` and `static-forever-*` return 404 too.
  - Every other variant tried (`classicforever`, `wowforever`, `classic-forever`, `classicplus`, `classic60` and others) returns 403.
- On Blizzard's API, 403 means an unknown namespace and 404 means a known namespace with no data. So `forever` is probably the right name, and the data is simply switched off.
- Blizzard hasn't documented the Forever API, and the forum thread "World of Warcraft: Forever API Namespace?" (us.forums.blizzard.com, /t/59774) has no Blizzard reply.
- **Community notes (unverified):**
  - The static namespace needs a version string (something like `static-1.60.1_70399-forever`), which can be read from links in API responses.
  - A realmless character route `/profile/wow/character/{name}-{surname}` exists in links but wasn't routed.
  - The hidden realm id is embedded in the protected-character id.
- **Quick check in a browser:**
  - `…workers.dev/api/blizzard?region=us&path=/data/wow/realm/index&namespace=dynamic-classic1x-us` lists Classic Era realms (worker OK).
  - Same URL with `namespace=dynamic-forever-us` gives 404 (Forever data off).

## Testing status
- **Mock-tested only.** No real Forever character has been loaded yet.
  - A Playwright run against mocked Blizzard and worker responses covered search, the multi-match picker, all sections, item icons, and phone-width layout, with no page errors.
  - Worker unit tests (Node with stubbed `fetch` and `caches`) covered proxying, the allowlist, the bad host/path/namespace/region checks, the token retry, caching and the CORS origin check.
- The real API response shapes for Forever are unknown. The first live run may need renderer tweaks, and the generic viewer and Raw JSON help with that.

## Open ideas / next steps
1. ~~Plain-language "Blizzard isn't sharing Forever data yet" message on 404~~ (done).
2. Add a worker probe route that tries candidate Forever namespaces and reports which respond, to detect when Blizzard re-enables data or renames it.
3. Once data is live, check real response shapes. The realmless lookup may need `/profile/wow/character/{name}-{surname}`, which would need a new pattern added to the worker's path allowlist.
4. Later: Forever best-in-slot data once guides exist after raids open on Dec 9.

## Conventions
- Develop on `claude/keen-goodall-kjc6bd`, then fast-forward `main` (GitHub Pages and Cloudflare both deploy from `main`).
- Never commit Blizzard credentials; they live only as Cloudflare secrets.
- Don't modify `Kalium2/WCgear`.
