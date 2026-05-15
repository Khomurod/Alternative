/**
 * Google Maps Platform API key (bundled; visible to anyone who unpacks the extension).
 * Restrict this key in Google Cloud (API + application limits, budgets, alerts).
 * Set to "" to force Leaflet/OSM only.
 */
export const GOOGLE_MAPS_API_KEY = "AIzaSyCAgt3Qeu23on07tvt-N7hqUsy0JsvGwMI";

export function mapProviderAttributionLine(tollguruConfigured = false) {
  if (tollguruConfigured) {
    return GOOGLE_MAPS_API_KEY
      ? "Map: Google Static Maps when available (c) Google; otherwise OpenStreetMap / Leaflet. Route: OSRM; truck tolls: TollGuru first, Google Routes toll estimate as fallback."
      : "Map: OpenStreetMap contributors. Routing: OSRM. Geocoding: Photon / Nominatim / local cities index. Truck tolls: TollGuru when API key is saved in the extension popup.";
  }
  return GOOGLE_MAPS_API_KEY
    ? "Map: Google Static Maps when available (c) Google; otherwise OpenStreetMap / Leaflet. Route: OSRM plus Google toll estimates."
    : "Map: OpenStreetMap contributors. Routing: OSRM. Geocoding: Photon / Nominatim / local cities index.";
}
