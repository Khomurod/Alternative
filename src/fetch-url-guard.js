/** Hostnames allowed for `dat-ext:fetch-json` background proxy requests. */
export const ALLOWED_FETCH_HOSTNAMES = [
  "gmail.googleapis.com",
  "apis.tollguru.com",
  "maps.googleapis.com",
  "routes.googleapis.com",
  "photon.komoot.io",
  "router.project-osrm.org",
  "nominatim.openstreetmap.org",
  "tile.openstreetmap.org"
];

const ALLOWED_HOSTNAME_SET = new Set(ALLOWED_FETCH_HOSTNAMES);

/**
 * Pathname checks per host (query strings ignored). Keeps the proxy off unexpected endpoints.
 *
 * @type {Record<string, (pathname: string) => boolean>}
 */
const PATH_RULES = {
  "apis.tollguru.com": (pathname) => pathname.startsWith("/toll/v2/"),
  "routes.googleapis.com": (pathname) => pathname.startsWith("/directions/v2"),
  "photon.komoot.io": (pathname) => pathname.startsWith("/api"),
  "router.project-osrm.org": (pathname) => pathname.startsWith("/route/v1/"),
  "nominatim.openstreetmap.org": (pathname) => pathname === "/search" || pathname.startsWith("/search"),
  "tile.openstreetmap.org": (pathname) => /^\/\d+\/\d+\/\d+\.png$/.test(pathname),
  "maps.googleapis.com": (pathname) => pathname.startsWith("/maps/api/"),
  "gmail.googleapis.com": (pathname) => pathname.startsWith("/gmail/v1/")
};

const BLOCKED_FETCH_JSON_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookie2",
  "host"
]);

/**
 * Drops hop-by-hop / credential headers and blocks `x-api-key` except on TollGuru (caller-supplied API key).
 *
 * @param {unknown} rawHeaders
 * @param {string} hostname
 * @returns {Record<string, string>}
 */
export function sanitizeFetchJsonHeaders(rawHeaders, hostname) {
  const host = String(hostname || "").toLowerCase();
  const src = rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders) ? rawHeaders : {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, val] of Object.entries(src)) {
    const lower = String(key || "").trim().toLowerCase();
    if (!lower || BLOCKED_FETCH_JSON_HEADERS.has(lower)) {
      continue;
    }
    if (lower === "x-api-key" && host !== "apis.tollguru.com") {
      continue;
    }
    out[key] = String(val ?? "");
  }
  return out;
}

/**
 * @param {string} rawUrl
 * @returns {URL}
 */
export function validateFetchUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (url.protocol === "chrome-extension:") {
    if (url.pathname === "/cities.json") {
      return url;
    }
    throw new Error("Security Error: Unauthorized chrome-extension resource.");
  }
  if (!ALLOWED_HOSTNAME_SET.has(url.hostname)) {
    throw new Error("Security Error: Unauthorized domain access attempt.");
  }
  const rule = PATH_RULES[url.hostname];
  if (!rule || !rule(url.pathname)) {
    throw new Error("Security Error: Unauthorized URL path for proxy.");
  }
  return url;
}
