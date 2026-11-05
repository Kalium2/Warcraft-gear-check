/**
 * Loot Ledger — WoW: Forever Armory API proxy (Cloudflare Worker)
 * ============================================================
 * A read-only pass-through to the Blizzard Battle.net API, so the
 * static site (kalium2.github.io/Warcraft-gear-check) can look up
 * characters without visitors needing their own API credentials.
 *
 *   GET /api/blizzard?region=us&path=/profile/wow/character/{realm}/{name}/equipment
 *                    &namespace=profile-forever-us&locale=en_US
 *   GET /health
 *
 * `path` may also be a full https://{region}.api.blizzard.com/... URL
 * (the "href" links Blizzard puts in its responses); the host is
 * checked and dropped, and the namespace in its query string is used.
 *
 * Blizzard's status code and JSON body are returned unchanged.
 *
 * Locked down so it can't be used as an open proxy:
 *   - GET only, Blizzard API hosts only (region allowlist)
 *   - path must match BLIZZARD_PROXY_PATHS
 *   - namespace / locale must be plain identifiers
 *   - CORS only for ALLOWED_ORIGINS
 *
 * Required secrets: BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET
 * Optional var:     ALLOWED_ORIGINS (comma-separated)
 * ============================================================
 */

const DEFAULT_ALLOWED_ORIGINS = "https://kalium2.github.io";
const BLIZZARD_TOKEN_URL = "https://oauth.battle.net/token";
const BLIZZARD_API_HOST = {
  us: "https://us.api.blizzard.com",
  eu: "https://eu.api.blizzard.com",
  kr: "https://kr.api.blizzard.com",
  tw: "https://tw.api.blizzard.com",
};

const BLIZZARD_PROXY_PATHS = [
  /^\/profile\/wow\/character\/[^/]+\/[^/]+(\/[a-z0-9-]+){0,2}$/,
  /^\/data\/wow\/realm\/index$/,
  /^\/data\/wow\/realm\/[a-z0-9-]+$/,
  /^\/data\/wow\/media\/item\/\d+$/,
  /^\/data\/wow\/item\/\d+$/,
  /^\/data\/wow\/guild\/[^/]+\/[^/]+(\/(roster|achievements|activity))?$/,
];
const SAFE_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const CACHE_TTL = { profile: 300, data: 3600 }; // seconds

const CACHE = caches.default;
const CACHE_ORIGIN = "https://forever-armory-cache.internal";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    let res;
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        res = jsonResponse({ ok: true, credentials: !!(env.BLIZZARD_CLIENT_ID && env.BLIZZARD_CLIENT_SECRET) }, 200);
      } else if (url.pathname === "/api/blizzard" && request.method === "GET") {
        res = await handleBlizzard(url, env, ctx);
      } else {
        res = jsonResponse({ error: "Not found" }, 404);
      }
    } catch (err) {
      console.error(err);
      res = jsonResponse({ error: err.expose ? err.message : "Upstream request failed." }, err.status || 502);
    }
    return withHeaders(res, cors);
  },
};

async function handleBlizzard(url, env, ctx) {
  const region = (url.searchParams.get("region") || "us").toLowerCase();
  const host = BLIZZARD_API_HOST[region];
  if (!host) return jsonResponse({ error: "Unsupported region." }, 400);

  const rawPath = url.searchParams.get("path") || "";
  let namespace = url.searchParams.get("namespace") || "";
  let path;
  if (/^https?:\/\//i.test(rawPath)) {
    let target;
    try { target = new URL(rawPath); } catch { return jsonResponse({ error: "Invalid path." }, 400); }
    if (!/^[a-z]{2}\.api\.blizzard\.com$/.test(target.hostname)) return jsonResponse({ error: "Invalid host." }, 400);
    path = target.pathname;
    namespace = target.searchParams.get("namespace") || namespace;
  } else {
    path = rawPath.split("?")[0];
  }
  try { path = decodeURIComponent(path); } catch { return jsonResponse({ error: "Invalid path." }, 400); }
  path = path.toLowerCase();

  if (!BLIZZARD_PROXY_PATHS.some((re) => re.test(path))) return jsonResponse({ error: "Path not allowed." }, 403);
  if (!SAFE_TOKEN.test(namespace)) return jsonResponse({ error: "Missing or invalid namespace." }, 400);
  const locale = url.searchParams.get("locale") || "en_US";
  if (!SAFE_TOKEN.test(locale)) return jsonResponse({ error: "Invalid locale." }, 400);

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const query = `?namespace=${namespace}&locale=${locale}`;
  const upstream = `${host}${encodedPath}${query}`;
  const cacheKey = new Request(`${CACHE_ORIGIN}/bnet/${region}${encodedPath}${query}`);

  try {
    const hit = await CACHE.match(cacheKey);
    if (hit) return hit;
  } catch {}

  const send = async (token) => fetch(upstream, { headers: { Authorization: `Bearer ${token}` } });
  let res = await send(await getBlizzardToken(env, ctx));
  if (res.status === 401) {
    // Cached token was revoked or expired early: get a fresh one and retry once.
    tokenCache = null;
    try { await CACHE.delete(new Request(`${CACHE_ORIGIN}/blizzard-token`)); } catch {}
    res = await send(await getBlizzardToken(env, ctx));
  }

  const body = await res.text();
  const ttl = path.startsWith("/profile/") ? CACHE_TTL.profile : CACHE_TTL.data;
  const out = new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": res.ok ? `public, max-age=${ttl}` : "no-store" },
  });
  if (res.ok) ctx.waitUntil(CACHE.put(cacheKey, out.clone()));
  return out;
}

/* ---------- OAuth client-credentials token ----------
   Cached in memory for warm isolates and in the Cache API across cold
   starts (same approach as the WCgear worker). */
let tokenCache = null; // { token, expiresAt }

async function getBlizzardToken(env, ctx) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  try {
    const hit = await CACHE.match(new Request(`${CACHE_ORIGIN}/blizzard-token`));
    if (hit) {
      const cached = await hit.json();
      if (cached.expiresAt > Date.now()) { tokenCache = cached; return cached.token; }
    }
  } catch {}

  if (!env.BLIZZARD_CLIENT_ID || !env.BLIZZARD_CLIENT_SECRET) {
    throw Object.assign(new Error("The worker has no Blizzard API credentials configured."), { status: 500, expose: true });
  }
  const res = await fetch(BLIZZARD_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    console.error(`Blizzard token request failed: ${res.status} ${await res.text()}`);
    throw Object.assign(new Error(`Blizzard authentication failed (status ${res.status}).`), { status: 502, expose: true });
  }
  const data = await res.json();
  const ttl = Math.max(60, (data.expires_in || 3600) - 60);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttl * 1000 };
  ctx.waitUntil(CACHE.put(
    new Request(`${CACHE_ORIGIN}/blizzard-token`),
    new Response(JSON.stringify(tokenCache), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } })
  ));
  return tokenCache.token;
}

/* ---------- helpers ---------- */
function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const h = { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function withHeaders(res, extra) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
