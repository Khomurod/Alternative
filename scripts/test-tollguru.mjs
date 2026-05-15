/**
 * Smoke-test TollGuru (polyline first, then origin–destination per API docs).
 * Usage: node scripts/test-tollguru.mjs YOUR_KEY
 *    or: set TOLLGURU_API_KEY=... && node scripts/test-tollguru.mjs
 */
import { fetchTollGuruLaneTolls } from "../src/tollguru-tolls.js";

const key = String(process.argv[2] || process.env.TOLLGURU_API_KEY || "").trim();
if (!key) {
  console.error("Pass API key as first argument or set TOLLGURU_API_KEY.");
  process.exit(1);
}

const requestJson = async (url, init = {}) => {
  const method = String(init?.method || "GET").toUpperCase();
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body !== undefined && init?.body !== null
        ? JSON.stringify(init.body)
        : undefined;
  const res = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...(init.headers || {}) },
    body: method === "GET" ? undefined : body
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 240)}`);
  }
  return res.json();
};

const line = [
  [40.7357, -74.1724],
  [39.9526, -75.1652]
];

try {
  const out = await fetchTollGuruLaneTolls(
    requestJson,
    key,
    {
      mapLineLatLngs: line,
      originAddress: "Newark, NJ",
      destinationAddress: "Philadelphia, PA"
    },
    { mapProvider: "osm" }
  );
  console.log("OK:", out);
} catch (e) {
  console.error("Failed:", e?.message || e);
  process.exit(1);
}
