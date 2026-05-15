/**
 * Google Maps Platform API key (bundled; visible to anyone who unpacks the extension).
 * Restrict this key in Google Cloud (API + application limits, budgets, alerts).
 * Set to "" to force Leaflet/OSM only.
 */
export const GOOGLE_MAPS_API_KEY = "AIzaSyCAgt3Qeu23on07tvt-N7hqUsy0JsvGwMI";

/**
 * Short footer line for map/routing provenance (optional tooling).
 *
 * @param {boolean | { tollguruConfigured?: boolean, googleTollFallbackAllowed?: boolean }} tollOpts
 */
export function mapProviderAttributionLine(tollOpts = false) {
  const tollConfigured =
    typeof tollOpts === "object" && tollOpts !== null ? tollOpts.tollguruConfigured === true : tollOpts === true;
  const googleFallbackAllowed =
    typeof tollOpts === "object" && tollOpts !== null && typeof tollOpts.googleTollFallbackAllowed === "boolean"
      ? tollOpts.googleTollFallbackAllowed
      : true;

  if (tollConfigured && !googleFallbackAllowed) {
    return GOOGLE_MAPS_API_KEY
      ? "Map: Google Static Maps when available (c) Google; otherwise OpenStreetMap / Leaflet. Route: OSRM. Truck tolls: TollGuru only (Google toll fallback off in extension options)."
      : "Map: OpenStreetMap contributors. Routing: OSRM. Geocoding: Photon / Nominatim / local cities index. Truck tolls: TollGuru only (Google toll fallback off).";
  }

  if (tollConfigured) {
    return GOOGLE_MAPS_API_KEY
      ? "Map: Google Static Maps when available (c) Google; otherwise OpenStreetMap / Leaflet. Route: OSRM; truck tolls: TollGuru first, Google Routes toll estimate as fallback."
      : "Map: OpenStreetMap contributors. Routing: OSRM. Geocoding: Photon / Nominatim / local cities index. Truck tolls: TollGuru when API key is saved in the extension popup.";
  }
  return GOOGLE_MAPS_API_KEY
    ? "Map: Google Static Maps when available (c) Google; otherwise OpenStreetMap / Leaflet. Route: OSRM plus Google toll estimates."
    : "Map: OpenStreetMap contributors. Routing: OSRM. Geocoding: Photon / Nominatim / local cities index.";
}
