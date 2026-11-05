# Loot Ledger — WoW: Forever Armory

A single static page (`index.html`) for looking up World of Warcraft: Forever characters with the official Blizzard Battle.net API. It has no backend: the browser talks to Blizzard directly.

## Setup
1. Create a free API client at https://develop.battle.net/access/clients.
2. Open the site, expand **Blizzard API access**, and enter the Client ID and Secret (or paste an access token).
3. Pick a region, type a character name and press **Search**.

## How it works
- **Realms:** Forever hides realms, so by default the page loads the realm index (`dynamic-forever-{region}`) and checks every realm for the name. If several characters match, you pick one.
- **Data:** It loads the character summary, follows every profile link the summary returns, and also tries a list of known endpoints (equipment, statistics, talents, professions, reputations, raids/dungeons, achievements, PvP, titles, collections, quests and more). Sections with a known layout get a dedicated view. Anything else is shown with a generic viewer, and the full raw JSON can be downloaded.
- **Namespaces:** Blizzard hasn't documented the Forever API yet. The defaults (`profile-forever-{region}`, `dynamic-forever-{region}`) come from community testing and can be changed under **Advanced** without touching code.
- **Links:** `#region/realm/name` links open a character directly.
