/** Hostnames allowed for `dat-ext:fetch-json` background proxy requests. */
export const ALLOWED_FETCH_HOSTNAMES = [
  "apis.tollguru.com",
  "maps.googleapis.com",
  "routes.googleapis.com",
  "photon.komoot.io",
  "router.project-osrm.org",
  "nominatim.openstreetmap.org"
];

const ALLOWED_HOSTNAME_SET = new Set(ALLOWED_FETCH_HOSTNAMES);

/**
 * @param {string} rawUrl
 * @returns {URL}
 */
export function validateFetchUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (!ALLOWED_HOSTNAME_SET.has(url.hostname)) {
    throw new Error("Security Error: Unauthorized domain access attempt.");
  }
  return url;
}
