import L from "leaflet";
import { GOOGLE_MAPS_API_KEY } from "./google-api-key.js";
import { downsamplePolyline, encodePolylinePrecision5 } from "./polyline-encode.js";

const STATIC_MAX_POINTS = 96;
const STATIC_WIDTH = 360;
const STATIC_HEIGHT = 360;

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
 * @param {{ pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
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
 * @param {HTMLElement} container
 * @param {Array<[number, number]>} lineLatLngs
 * @param {{ pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
 * @returns {{ remove(): void, invalidateSize(): void } | null}
 */
function tryMountGoogleStaticMap(container, lineLatLngs, mapOptions = {}) {
  try {
    const simplified = downsamplePolyline(lineLatLngs, STATIC_MAX_POINTS);
    const encoded = encodePolylinePrecision5(simplified);
    const pathStart = lineLatLngs[0];
    const pathEnd = lineLatLngs[lineLatLngs.length - 1];

    const pickupMarker = isLatLngPair(mapOptions.pickupLatLng) ? mapOptions.pickupLatLng : pathStart;
    const deliveryMarker = isLatLngPair(mapOptions.deliveryLatLng) ? mapOptions.deliveryLatLng : pathEnd;

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

    if (isLatLngPair(pickupMarker) && isLatLngPair(deliveryMarker)) {
      params.append("markers", `color:0x0b66ff|size:mid|label:A|${pickupMarker[0]},${pickupMarker[1]}`);
      params.append("markers", `color:0xc2410c|size:mid|label:B|${deliveryMarker[0]},${deliveryMarker[1]}`);
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
 * @param {{ pickupLatLng?: [number, number] | null, deliveryLatLng?: [number, number] | null }} mapOptions
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

    if (isLatLngPair(mapOptions.pickupLatLng)) {
      L.marker([mapOptions.pickupLatLng[0], mapOptions.pickupLatLng[1]], {
        icon: buildLetterMarker("A", "#0b66ff")
      }).addTo(map);
    }
    if (isLatLngPair(mapOptions.deliveryLatLng)) {
      L.marker([mapOptions.deliveryLatLng[0], mapOptions.deliveryLatLng[1]], {
        icon: buildLetterMarker("B", "#c2410c")
      }).addTo(map);
    }

    map.fitBounds(polyline.getBounds().pad(0.12));

    return map;
  } catch {
    return null;
  }
}

function buildLetterMarker(letter, color) {
  return L.divIcon({
    className: "dat-ext-col__leaflet-letter-marker",
    html: `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:${color};color:#fff;font:700 11px/1 Arial,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(16,24,40,0.35);">${letter}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}
