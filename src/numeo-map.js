import L from "leaflet";
import { GOOGLE_MAPS_API_KEY } from "./google-api-key.js";
import { downsamplePolyline, encodePolylinePrecision5 } from "./polyline-encode.js";
import { haversineMiles } from "./routing.js";

const STATIC_MAX_POINTS = 96;
const STATIC_WIDTH = 360;
const STATIC_HEIGHT = 360;

/** When search origin and pickup are closer than this, show a single combined pickup marker. */
export const OVERLAP_MERGE_MILES = 1;

const MARKER_COLORS = {
  search: "#0b66ff",
  pickup: "#16a34a",
  delivery: "#dc2626"
};

/**
 * @typedef {Object} LaneMapMarker
 * @property {[number, number]} latLng
 * @property {string} label
 * @property {string} color
 * @property {boolean} [combined]
 */

/**
 * @param {unknown} pair
 * @returns {boolean}
 */
function isLatLngPair(pair) {
  return (
    Array.isArray(pair) &&
    pair.length >= 2 &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1])
  );
}

/**
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {number} [maxMiles]
 */
export function latLngsWithinMiles(a, b, maxMiles = OVERLAP_MERGE_MILES) {
  if (!isLatLngPair(a) || !isLatLngPair(b)) {
    return false;
  }
  return haversineMiles({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) <= maxMiles;
}

/**
 * @param {{ searchOriginLatLng?: [number, number] | null, pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
 * @returns {LaneMapMarker[]}
 */
export function resolveThreePointMarkers(mapOptions = {}) {
  const search = isLatLngPair(mapOptions.searchOriginLatLng) ? mapOptions.searchOriginLatLng : null;
  const pickup = isLatLngPair(mapOptions.pickupLatLng) ? mapOptions.pickupLatLng : null;
  const delivery = isLatLngPair(mapOptions.deliveryLatLng) ? mapOptions.deliveryLatLng : null;
  const overlap = search && pickup && latLngsWithinMiles(search, pickup, OVERLAP_MERGE_MILES);

  /** @type {LaneMapMarker[]} */
  const markers = [];

  if (search && !overlap) {
    markers.push({ latLng: search, label: "A", color: MARKER_COLORS.search });
  }

  if (pickup) {
    markers.push({
      latLng: pickup,
      label: overlap ? "A+B" : "B",
      color: MARKER_COLORS.pickup,
      combined: Boolean(overlap)
    });
  }

  if (delivery) {
    markers.push({ latLng: delivery, label: "C", color: MARKER_COLORS.delivery });
  }

  return markers;
}

/**
 * @param {Array<[number, number]>} latLngs
 * @returns {{ minLat: number, maxLat: number, minLng: number, maxLng: number } | null}
 */
function boundsFromLatLngs(latLngs) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const pt of latLngs) {
    const lat = pt?.[0];
    const lng = pt?.[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  if (!Number.isFinite(minLat) || minLat === Infinity) {
    return null;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * @param {HTMLElement} container
 * @param {Array<[number, number]>} lineLatLngs Leaflet [lat, lng] pairs
 * @param {{ searchOriginLatLng?: [number, number] | null, pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
 * @returns {{ remove(): void, invalidateSize(): void } | import("leaflet").Map | null}
 */
export function mountLaneMap(container, lineLatLngs, mapOptions = {}) {
  if (!(container instanceof HTMLElement) || !Array.isArray(lineLatLngs) || lineLatLngs.length < 2) {
    return null;
  }

  if (GOOGLE_MAPS_API_KEY) {
    const staticMap = tryMountGoogleStaticMap(container, lineLatLngs, mapOptions);
    if (staticMap) {
      return staticMap;
    }
  }

  return mountLeafletMap(container, lineLatLngs, mapOptions);
}

/**
 * @param {{ remove(): void, invalidateSize?(): void } | import("leaflet").Map | null | undefined} map
 */
export function destroyLaneMap(map) {
  if (map && typeof map.remove === "function") {
    map.remove();
  }
}

/**
 * Google Static Maps labels are a single character; map combined A+B to "B" at pickup.
 * @param {LaneMapMarker} marker
 */
function staticMapLabel(marker) {
  if (marker.combined) {
    return "B";
  }
  const label = String(marker.label || "").trim();
  if (label === "A+B") {
    return "B";
  }
  return label.charAt(0).toUpperCase();
}

/**
 * @param {LaneMapMarker} marker
 */
function appendStaticMapMarker(params, marker) {
  const label = staticMapLabel(marker);
  const color = marker.color.replace("#", "0x");
  params.append(
    "markers",
    `color:${color}|size:mid|label:${label}|${marker.latLng[0]},${marker.latLng[1]}`
  );
}

/**
 * @param {HTMLElement} container
 * @param {Array<[number, number]>} lineLatLngs
 * @param {{ searchOriginLatLng?: [number, number] | null, pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
 * @returns {{ remove(): void, invalidateSize(): void } | null}
 */
function tryMountGoogleStaticMap(container, lineLatLngs, mapOptions = {}) {
  try {
    const simplified = downsamplePolyline(lineLatLngs, STATIC_MAX_POINTS);
    const encoded = encodePolylinePrecision5(simplified);
    const markers = resolveThreePointMarkers(mapOptions);

    const params = new URLSearchParams({
      size: `${STATIC_WIDTH}x${STATIC_HEIGHT}`,
      scale: "2",
      maptype: "roadmap",
      key: GOOGLE_MAPS_API_KEY
    });

    const pathParam = `weight:4|color:0x2563eb|enc:${encoded}`;
    params.append("path", pathParam);

    const bounds = boundsFromLatLngs(lineLatLngs);
    if (bounds) {
      params.append("visible", `${bounds.minLat},${bounds.minLng}`);
      params.append("visible", `${bounds.maxLat},${bounds.maxLng}`);
    }

    for (const marker of markers) {
      appendStaticMapMarker(params, marker);
    }

    const url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    if (url.length > 7800) {
      return null;
    }

    const img = document.createElement("img");
    img.className = "dat-ext-col__static-map-img";
    img.alt = "Lane route map (Google Static Maps)";
    img.decoding = "async";
    img.loading = "lazy";
    img.src = url;
    img.referrerPolicy = "no-referrer-when-downgrade";

    container.replaceChildren(img);

    return {
      remove() {
        img.remove();
      },
      invalidateSize() {
        /* no-op for raster image */
      }
    };
  } catch {
    return null;
  }
}

/**
 * @param {HTMLElement} container
 * @param {Array<[number, number]>} lineLatLngs
 * @param {{ searchOriginLatLng?: [number, number] | null, pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
 * @returns {import("leaflet").Map | null}
 */
function mountLeafletMap(container, lineLatLngs, mapOptions = {}) {
  try {
    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; Routing &copy; OSRM'
    }).addTo(map);

    const polyline = L.polyline(lineLatLngs, { color: "#0b66ff", weight: 4, opacity: 0.92 }).addTo(map);

    for (const marker of resolveThreePointMarkers(mapOptions)) {
      L.marker([marker.latLng[0], marker.latLng[1]], {
        icon: buildLetterMarker(marker.label, marker.color, marker.combined)
      }).addTo(map);
    }

    map.fitBounds(polyline.getBounds().pad(0.12));

    return map;
  } catch {
    return null;
  }
}

/**
 * @param {string} letter
 * @param {string} color
 * @param {boolean} [combined]
 */
function buildLetterMarker(letter, color, combined = false) {
  const width = combined ? 30 : 22;
  const height = 22;
  const fontSize = combined ? 9 : 11;
  return L.divIcon({
    className: "dat-ext-col__leaflet-letter-marker",
    html: `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:${width}px;height:${height}px;padding:0 4px;border-radius:999px;background:${color};color:#fff;font:700 ${fontSize}px/1 Arial,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(16,24,40,0.35);white-space:nowrap;">${letter}</span>`,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), Math.round(height / 2)]
  });
}
