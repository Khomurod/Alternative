import { sanitizeLocationText } from "./parsers.js";
import { GOOGLE_MAPS_API_KEY } from "./google-api-key.js";
import { DEFAULT_TOLLGURU_VEHICLE_TYPE } from "./tollguru-api-key.js";
import { fetchTollGuruLaneTolls } from "./tollguru-tolls.js";

const CACHE_PREFIX = "dat-ext-route-cache-v4:";
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const STATE_NAMES = {
  AL: "alabama",
  AK: "alaska",
  AZ: "arizona",
  AR: "arkansas",
  CA: "california",
  CO: "colorado",
  CT: "connecticut",
  DE: "delaware",
  FL: "florida",
  GA: "georgia",
  HI: "hawaii",
  ID: "idaho",
  IL: "illinois",
  IN: "indiana",
  IA: "iowa",
  KS: "kansas",
  KY: "kentucky",
  LA: "louisiana",
  ME: "maine",
  MD: "maryland",
  MA: "massachusetts",
  MI: "michigan",
  MN: "minnesota",
  MS: "mississippi",
  MO: "missouri",
  MT: "montana",
  NE: "nebraska",
  NV: "nevada",
  NH: "new hampshire",
  NJ: "new jersey",
  NM: "new mexico",
  NY: "new york",
  NC: "north carolina",
  ND: "north dakota",
  OH: "ohio",
  OK: "oklahoma",
  OR: "oregon",
  PA: "pennsylvania",
  RI: "rhode island",
  SC: "south carolina",
  SD: "south dakota",
  TN: "tennessee",
  TX: "texas",
  UT: "utah",
  VT: "vermont",
  VA: "virginia",
  WA: "washington",
  WV: "west virginia",
  WI: "wisconsin",
  WY: "wyoming",
  DC: "district of columbia"
};

export function parseCityState(text) {
  const cleaned = sanitizeLocationText(text);
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/^([A-Za-z.' -]+),\s*([A-Z]{2})$/i);
  if (!match) {
    return null;
  }

  const city = match[1].trim();
  const state = match[2].toUpperCase();

  return {
    city,
    state,
    display: `${city}, ${state}`,
    key: normalizeCityStateKey(city, state)
  };
}

export function normalizeCityStateKey(city, state) {
  return `${String(city || "").trim().toLowerCase()}|${String(state || "").trim().toLowerCase()}`;
}

export function buildCitiesIndex(records) {
  const index = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const city = String(record?.city || "").trim();
    const state = String(record?.state || "").trim().toUpperCase();
    const lat = Number(record?.lat);
    const lon = Number(record?.lon);

    if (!city || !state || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    index.set(normalizeCityStateKey(city, state), {
      city,
      state,
      lat,
      lon,
      source: "cities.json"
    });
  }

  return index;
}

export function haversineMiles(origin, destination) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(destination.lat - origin.lat);
  const dLon = toRadians(destination.lon - origin.lon);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 3958.8 * c;
}

export function adjustedRoadMiles(straightLineMiles) {
  return straightLineMiles > 0 ? straightLineMiles * 1.15 : 0;
}

function buildLaneKey(origin, destination) {
  return `${origin.key}__${destination.key}`;
}

function defaultStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCache(storage, laneKey) {
  if (!storage || !laneKey) {
    return null;
  }

  try {
    const raw = storage.getItem(`${CACHE_PREFIX}${laneKey}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const age = Date.now() - Date.parse(parsed?.updatedAt || 0);
    if (!Number.isFinite(age) || age > CACHE_MAX_AGE_MS) {
      storage.removeItem(`${CACHE_PREFIX}${laneKey}`);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCache(storage, laneKey, payload) {
  if (!storage || !laneKey || !payload) {
    return;
  }

  try {
    storage.setItem(
      `${CACHE_PREFIX}${laneKey}`,
      JSON.stringify({
        ...payload,
        updatedAt: new Date().toISOString()
      })
    );
  } catch {
    /* Ignore storage quota failures */
  }
}

function getCitiesUrl(runtime) {
  if (runtime?.getURL) {
    return runtime.getURL("cities.json");
  }

  return "cities.json";
}

function normalizeLookupText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStateVariants(stateCode) {
  const code = String(stateCode || "").trim().toLowerCase();
  const full = STATE_NAMES[String(stateCode || "").trim().toUpperCase()] || "";
  return new Set([code, normalizeLookupText(full)].filter(Boolean));
}

function stateMatches(props, stateCode) {
  const variants = getStateVariants(stateCode);
  const candidateValues = [
    props?.state,
    props?.statecode,
    props?.province,
    props?.region
  ]
    .map((value) => normalizeLookupText(value))
    .filter(Boolean);

  return candidateValues.some((value) => variants.has(value));
}

function cityMatches(props, cityName) {
  const cityNeedle = normalizeLookupText(cityName);
  const candidates = [props?.name, props?.city, props?.county, props?.locality]
    .map((value) => normalizeLookupText(value))
    .filter(Boolean);

  return candidates.some((candidate) => candidate === cityNeedle || candidate.includes(cityNeedle) || cityNeedle.includes(candidate));
}

function buildRequestJson({ fetchImpl, runtime }) {
  return async (url, init = {}) => {
    const method = String(init?.method || "GET").toUpperCase();
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body !== undefined && init?.body !== null
        ? JSON.stringify(init.body)
        : undefined;

    if (runtime?.id && typeof runtime.sendMessage === "function") {
      try {
        return await new Promise((resolve, reject) => {
          runtime.sendMessage(
            {
              type: "dat-ext:fetch-json",
              url,
              method,
              headers: init.headers || {},
              body
            },
            (response) => {
              const runtimeError = runtime.lastError;
              if (runtimeError) {
                reject(new Error(runtimeError.message || "Background fetch failed"));
                return;
              }

              if (!response?.ok) {
                reject(new Error(response?.error || "Background fetch failed"));
                return;
              }

              resolve(response.data);
            }
          );
        });
      } catch (error) {
        if (!fetchImpl) {
          throw error;
        }
      }
    }

    if (!fetchImpl) {
      throw new Error("No fetch implementation available for routing");
    }

    const response = await fetchImpl(url, {
      ...init,
      method,
      body: method === "GET" ? undefined : body,
      headers: {
        Accept: "application/json",
        ...(init.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  };
}

async function geocodeWithPhoton(requestJson, location) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", `${location.city}, ${location.state}`);
  url.searchParams.set("limit", "5");
  const data = await requestJson(url.toString());
  const features = Array.isArray(data?.features) ? data.features : [];

  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    const props = feature?.properties || {};
    if (!Array.isArray(coords) || coords.length < 2) {
      continue;
    }

    const isUs = String(props.countrycode || "us").toLowerCase() === "us";
    const cityMatch = cityMatches(props, location.city);
    const stateMatch = stateMatches(props, location.state);

    if (!isUs || !cityMatch) {
      continue;
    }

    if (stateMatch || features.length === 1) {
      return {
        city: location.city,
        state: location.state,
        lat: Number(coords[1]),
        lon: Number(coords[0]),
        source: "photon"
      };
    }
  }

  return null;
}

async function geocodeWithNominatim(requestJson, location) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("city", location.city);
  url.searchParams.set("state", STATE_NAMES[location.state] || location.state);
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  const data = await requestJson(url.toString(), {
    headers: {
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const items = Array.isArray(data) ? data : [];
  for (const item of items) {
    const address = item?.address || {};
    if (!cityMatches(address, location.city) || !stateMatches(address, location.state)) {
      continue;
    }

    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    return {
      city: location.city,
      state: location.state,
      lat,
      lon,
      source: "nominatim"
    };
  }

  return null;
}

/**
 * @param {Array<[number, number]>} coords GeoJSON [lng, lat]
 * @returns {Array<[number, number]>}
 */
function geoJsonLineToLeafletLatLngs(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    return [];
  }
  return coords.map(([lng, lat]) => [lat, lng]);
}

function endpointLineLatLngs(origin, destination) {
  return [
    [origin.lat, origin.lon],
    [destination.lat, destination.lon]
  ];
}

function decodeGooglePolyline(encodedPolyline) {
  const encoded = String(encodedPolyline || "");
  if (!encoded) {
    return [];
  }

  let index = 0;
  let lat = 0;
  let lng = 0;
  const points = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const latDelta = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += latDelta;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const lngDelta = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += lngDelta;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function readGoogleTollInfo(route) {
  if (!route || typeof route !== "object") {
    return null;
  }
  if (route.travelAdvisory?.tollInfo) {
    return route.travelAdvisory.tollInfo;
  }
  if (route.routeTravelAdvisory?.tollInfo) {
    return route.routeTravelAdvisory.tollInfo;
  }
  const legWithTolls = Array.isArray(route.legs)
    ? route.legs.find((leg) => leg?.travelAdvisory?.tollInfo)
    : null;
  return legWithTolls?.travelAdvisory?.tollInfo ?? null;
}

function moneyUnitsToFloat(money) {
  const units = Number(money?.units ?? 0);
  const nanos = Number(money?.nanos ?? 0);
  if (!Number.isFinite(units) && !Number.isFinite(nanos)) {
    return null;
  }
  const whole = Number.isFinite(units) ? units : 0;
  const fraction = Number.isFinite(nanos) ? nanos / 1e9 : 0;
  return whole + fraction;
}

function formatTollStatusFromGoogle(route) {
  const tollInfo = readGoogleTollInfo(route);
  if (!tollInfo) {
    return "No tolls reported";
  }

  const estimatedPrices = Array.isArray(tollInfo.estimatedPrice) ? tollInfo.estimatedPrice : [];
  if (!estimatedPrices.length) {
    return "Toll segments detected (estimate unavailable)";
  }

  const priceParts = estimatedPrices
    .map((price) => {
      const amount = moneyUnitsToFloat(price);
      const currency = String(price?.currencyCode || "").trim().toUpperCase();
      if (!Number.isFinite(amount)) {
        return null;
      }
      const amountText = amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return currency ? `${currency} ${amountText}` : `$${amountText}`;
    })
    .filter(Boolean);

  if (!priceParts.length) {
    return "Toll segments detected (estimate unavailable)";
  }
  if (priceParts.length === 1) {
    return `${priceParts[0]} est`;
  }
  return `${priceParts.join(" + ")} est`;
}

async function routeWithGoogleRoutes(requestJson, origin, destination, apiKey) {
  const response = await requestJson("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo"
    },
    body: {
      origin: {
        location: {
          latLng: {
            latitude: origin.lat,
            longitude: origin.lon
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.lat,
            longitude: destination.lon
          }
        }
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false
      },
      extraComputations: ["TOLLS"],
      languageCode: "en-US",
      units: "IMPERIAL"
    }
  });

  const routes = Array.isArray(response?.routes) ? response.routes : [];
  if (!routes.length) {
    throw new Error("Google Routes returned no routes");
  }

  const primary = routes[0];
  const exactMiles = Number(primary?.distanceMeters) / 1609.344;
  const decoded = decodeGooglePolyline(primary?.polyline?.encodedPolyline);
  const mapLineLatLngs = decoded.length >= 2 ? decoded : endpointLineLatLngs(origin, destination);

  return {
    exactMiles: Number.isFinite(exactMiles) && exactMiles > 0 ? exactMiles : null,
    adjustedMiles: Number.isFinite(exactMiles) && exactMiles > 0 ? exactMiles : null,
    routeOptionsCount: routes.length,
    routeSource: "Google Routes exact route",
    routeConfidence: Number.isFinite(exactMiles) && exactMiles > 0 ? "exact" : "estimated",
    routeUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      `${origin.lat},${origin.lon}`
    )}&destination=${encodeURIComponent(`${destination.lat},${destination.lon}`)}&travelmode=driving`,
    tollStatus: formatTollStatusFromGoogle(primary),
    mapLineLatLngs,
    notes: routes.length > 1 ? [`${routes.length} route options returned`] : []
  };
}

async function routeWithOsrm(requestJson, origin, destination) {
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`
  );
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("overview", "simplified");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  url.searchParams.set("annotations", "false");
  const data = await requestJson(url.toString());
  const routes = Array.isArray(data?.routes) ? data.routes : [];
  if (!routes.length) {
    throw new Error("OSRM returned no routes");
  }

  const primary = routes[0];
  const exactMiles = Number(primary.distance) / 1609.344;
  const gjCoords = primary.geometry?.coordinates;
  const decoded = geoJsonLineToLeafletLatLngs(gjCoords);
  const mapLineLatLngs = decoded.length >= 2 ? decoded : endpointLineLatLngs(origin, destination);

  return {
    exactMiles,
    adjustedMiles: exactMiles,
    routeOptionsCount: routes.length,
    routeSource: "OSRM exact route",
    routeConfidence: "exact",
    routeUrl: buildRouteUrl(origin, destination),
    tollStatus: "Unavailable on free public route data",
    mapLineLatLngs,
    notes: routes.length > 1 ? [`${routes.length} route options returned`] : []
  };
}

function buildRouteUrl(origin, destination) {
  const route = `${origin.lat},${origin.lon};${destination.lat},${destination.lon}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
}

function buildUnavailableResult(origin, destination, note) {
  return {
    laneKey: origin && destination ? buildLaneKey(origin, destination) : null,
    origin,
    destination,
    exactMiles: null,
    adjustedMiles: null,
    routeOptionsCount: 0,
    routeSource: "Unavailable",
    routeConfidence: "unavailable",
    routeUrl: null,
    tollStatus: "Unavailable",
    tollSource: "none",
    mapLineLatLngs: null,
    notes: note ? [note] : []
  };
}

/**
 * Concatenate two Leaflet [lat, lng] polylines for one map, dropping a duplicate join vertex.
 * @param {Array<[number, number]>|null|undefined} seqA
 * @param {Array<[number, number]>|null|undefined} seqB
 * @returns {Array<[number, number]>|null}
 */
export function mergeRouteLatLngs(seqA, seqB) {
  const a = Array.isArray(seqA) ? seqA : [];
  const b = Array.isArray(seqB) ? seqB : [];
  if (!a.length && !b.length) {
    return null;
  }
  if (!a.length) {
    return b;
  }
  if (!b.length) {
    return a;
  }
  const [lat1, lng1] = a[a.length - 1];
  const [lat2, lng2] = b[0];
  const close = Math.abs(lat1 - lat2) < 0.0001 && Math.abs(lng1 - lng2) < 0.0001;
  return [...a, ...(close ? b.slice(1) : b)];
}

function combineRouteConfidence(a, b) {
  const rank = { unavailable: 0, estimated: 1, exact: 2 };
  const ra = rank[a] ?? 0;
  const rb = rank[b] ?? 0;
  const out = ra <= rb ? a : b;
  return out || "unavailable";
}

/**
 * Dispatcher-style miles: (search origin -> pickup) + (pickup -> delivery), one map polyline.
 * Skips the first leg when search origin is empty or matches pickup.
 *
 * @param {{ inspectLane: (o: string, d: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>> }} routeInspector
 * @param {string} searchOriginText
 * @param {string} pickupText
 * @param {string} deliveryText
 * @param {Record<string, unknown>} [routeOptions]
 */
export async function inspectDispatcherM3Route(routeInspector, searchOriginText, pickupText, deliveryText, routeOptions) {
  if (!routeInspector || typeof routeInspector.inspectLane !== "function") {
    return null;
  }

  const pickup = parseCityState(pickupText);
  const delivery = parseCityState(deliveryText);
  if (!pickup || !delivery) {
    return buildUnavailableResult(pickup, delivery, "Could not parse pickup or delivery.");
  }

  const search = parseCityState(searchOriginText || "");
  const samePickup =
    search &&
    normalizeCityStateKey(search.city, search.state) === normalizeCityStateKey(pickup.city, pickup.state);

  /** @type {Record<string, unknown>|null} */
  let leg1 = null;
  if (search && !samePickup) {
    leg1 = await routeInspector.inspectLane(search.display, pickup.display, routeOptions);
  }

  const leg2 = await routeInspector.inspectLane(pickup.display, delivery.display, routeOptions);

  const m1 = leg1 && typeof leg1.adjustedMiles === "number" && Number.isFinite(leg1.adjustedMiles) ? leg1.adjustedMiles : null;
  const m2 = typeof leg2.adjustedMiles === "number" && Number.isFinite(leg2.adjustedMiles) ? leg2.adjustedMiles : null;

  const notes = [];
  if (leg1 && m1 === null) {
    notes.push("Search origin -> pickup route was unavailable; miles use pickup -> delivery only.");
  }

  let adjustedMiles = null;
  if (m2 !== null) {
    adjustedMiles = (m1 !== null ? m1 : 0) + m2;
  } else if (m1 !== null) {
    adjustedMiles = m1;
  }

  const mapLineLatLngs = mergeRouteLatLngs(
    leg1 && Array.isArray(leg1.mapLineLatLngs) ? leg1.mapLineLatLngs : null,
    Array.isArray(leg2.mapLineLatLngs) ? leg2.mapLineLatLngs : null
  );

  const geocodeSources = [
    ...(Array.isArray(leg1?.geocodeSources) ? leg1.geocodeSources : []),
    ...(Array.isArray(leg2.geocodeSources) ? leg2.geocodeSources : [])
  ];

  const routeSource = leg1 && !samePickup ? "Two-leg (search->pickup + pickup->delivery)" : "Pickup->delivery";

  const routeConfidence = leg1
    ? combineRouteConfidence(String(leg1.routeConfidence || ""), String(leg2.routeConfidence || ""))
    : String(leg2.routeConfidence || "");

  const allNotes = [
    ...notes,
    ...(Array.isArray(leg1?.notes) ? leg1.notes : []),
    ...(Array.isArray(leg2.notes) ? leg2.notes : [])
  ];

  const leg1Line = leg1 && Array.isArray(leg1.mapLineLatLngs) ? leg1.mapLineLatLngs : [];
  const leg2Line = Array.isArray(leg2.mapLineLatLngs) ? leg2.mapLineLatLngs : [];

  let searchOriginLatLng = null;
  if (leg1Line.length >= 1) {
    const leg1Start = leg1Line[0];
    if (Array.isArray(leg1Start) && leg1Start.length >= 2 && Number.isFinite(leg1Start[0]) && Number.isFinite(leg1Start[1])) {
      searchOriginLatLng = [leg1Start[0], leg1Start[1]];
    }
  }

  let pickupMapLatLng = null;
  let deliveryMapLatLng = null;
  if (leg2Line.length >= 1) {
    const first = leg2Line[0];
    const last = leg2Line[leg2Line.length - 1];
    if (Array.isArray(first) && first.length >= 2 && Number.isFinite(first[0]) && Number.isFinite(first[1])) {
      pickupMapLatLng = [first[0], first[1]];
    }
    if (Array.isArray(last) && last.length >= 2 && Number.isFinite(last[0]) && Number.isFinite(last[1])) {
      deliveryMapLatLng = [last[0], last[1]];
    }
  }

  if (!searchOriginLatLng && samePickup && pickupMapLatLng) {
    searchOriginLatLng = [pickupMapLatLng[0], pickupMapLatLng[1]];
  }

  return {
    laneKey: `m3:${search?.key ?? "na"}|${pickup.key}|${delivery.key}`,
    origin: pickup,
    destination: delivery,
    exactMiles: null,
    adjustedMiles,
    routeOptionsCount: Number(leg1?.routeOptionsCount || 0) + Number(leg2.routeOptionsCount || 0),
    routeSource,
    routeConfidence,
    routeUrl: leg2.routeUrl ?? null,
    tollStatus: leg2.tollStatus ?? "Unavailable",
    tollSource: typeof leg2.tollSource === "string" ? leg2.tollSource : "none",
    tollVehicleType: typeof leg2.tollVehicleType === "string" ? leg2.tollVehicleType : undefined,
    mapLineLatLngs,
    searchOriginLatLng,
    pickupMapLatLng,
    deliveryMapLatLng,
    geocodeSources,
    notes: allNotes
  };
}

export function createRouteInspector(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  const storage = options.storage ?? defaultStorage();
  const runtime = options.runtime ?? globalThis.chrome?.runtime ?? null;
  const googleApiKey =
    typeof options.googleApiKey === "string" ? options.googleApiKey.trim() : GOOGLE_MAPS_API_KEY;
  const tollguruApiKey =
    typeof options.tollguruApiKey === "string" ? options.tollguruApiKey.trim() : "";
  const tollguruVehicleType =
    typeof options.tollguruVehicleType === "string" && options.tollguruVehicleType.trim()
      ? options.tollguruVehicleType.trim()
      : DEFAULT_TOLLGURU_VEHICLE_TYPE;
  const requestJson = options.requestJson || buildRequestJson({ fetchImpl, runtime });
  const pending = new Map();
  let citiesPromise = null;

  async function loadCitiesIndex() {
    if (options.citiesRecords) {
      return buildCitiesIndex(options.citiesRecords);
    }

    if (!requestJson) {
      return new Map();
    }

    if (!citiesPromise) {
      citiesPromise = requestJson(getCitiesUrl(runtime))
        .then((records) => buildCitiesIndex(records))
        .catch(() => new Map());
    }

    return citiesPromise;
  }

  async function resolveCoordinates(location) {
    const cities = await loadCitiesIndex();
    const localHit = cities.get(location.key);
    if (localHit) {
      return localHit;
    }

    if (!requestJson) {
      return null;
    }

    const photon = await geocodeWithPhoton(requestJson, location).catch(() => null);
    if (photon) {
      return photon;
    }

    return geocodeWithNominatim(requestJson, location).catch(() => null);
  }

  async function computeLane(origin, destination, options = {}) {
    const forceRefresh = options?.forceRefresh === true;
    const laneKey = buildLaneKey(origin, destination);
    if (!forceRefresh) {
      const cached = readCache(storage, laneKey);
      if (cached) {
        return cached;
      }
    }

    const originCoords = await resolveCoordinates(origin);
    const destinationCoords = await resolveCoordinates(destination);

    if (!originCoords || !destinationCoords) {
      const unavailable = buildUnavailableResult(origin, destination, "Could not geocode this lane.");
      writeCache(storage, laneKey, unavailable);
      return unavailable;
    }

    if (requestJson) {
      let osrmRoute = null;
      let osrmError = null;
      try {
        osrmRoute = await routeWithOsrm(requestJson, originCoords, destinationCoords);
      } catch (error) {
        osrmError = error;
      }

      let googleRoute = null;
      let googleError = null;
      if (googleApiKey) {
        try {
          googleRoute = await routeWithGoogleRoutes(requestJson, originCoords, destinationCoords, googleApiKey);
        } catch (error) {
          googleError = error;
        }
      }

      if (osrmRoute || googleRoute) {
        const baseRoute = osrmRoute ?? googleRoute;
        const payload = {
          ...baseRoute,
          laneKey,
          origin,
          destination,
          geocodeSources: [originCoords.source, destinationCoords.source],
          mapLineLatLngs: baseRoute.mapLineLatLngs ?? endpointLineLatLngs(originCoords, destinationCoords)
        };

        const polylineSource = osrmRoute?.mapLineLatLngs?.length >= 2 ? osrmRoute : googleRoute;
        const mapProviderForTg =
          polylineSource === osrmRoute && osrmRoute?.mapLineLatLngs?.length >= 2 ? "osm" : "google";

        let tollFromTg = null;
        /** @type {"polyline" | "origin-destination" | null} */
        let tollGuruVia = null;
        if (tollguruApiKey && requestJson) {
          try {
            const tg = await fetchTollGuruLaneTolls(
              requestJson,
              tollguruApiKey,
              {
                mapLineLatLngs: polylineSource?.mapLineLatLngs ?? null,
                originAddress: origin?.display,
                destinationAddress: destination?.display
              },
              { mapProvider: mapProviderForTg, vehicleType: tollguruVehicleType }
            );
            tollFromTg = tg.tollStatus;
            tollGuruVia = tg.via;
          } catch (error) {
            console.error("[TollGuru Debug] Fetch failed (inspectLane):", error);
            console.warn("[TollGuru Debug] Context:", {
              origin: origin?.display,
              destination: destination?.display,
              hasKey: Boolean(tollguruApiKey),
              keyLength: tollguruApiKey?.length ?? 0,
              mapProviderForTg,
              polylinePointCount: polylineSource?.mapLineLatLngs?.length ?? 0
            });
            tollFromTg = null;
            tollGuruVia = null;
          }
        }

        if (tollFromTg) {
          payload.tollStatus = tollFromTg;
        } else if (googleRoute) {
          payload.tollStatus = googleRoute.tollStatus;
        } else if (!googleApiKey) {
          payload.tollStatus = "Toll estimate unavailable (Google API key not configured)";
        }

        if (tollFromTg) {
          payload.tollSource = "tollguru";
          payload.tollVehicleType = tollguruVehicleType;
        } else if (
          googleRoute &&
          String(googleRoute.tollStatus || "").trim() &&
          payload.tollStatus === googleRoute.tollStatus
        ) {
          payload.tollSource = "google";
        } else {
          payload.tollSource = "none";
        }

        if (osrmRoute && googleRoute) {
          if (tollFromTg) {
            payload.notes = [
              ...(Array.isArray(osrmRoute.notes) ? osrmRoute.notes : []),
              ...(Array.isArray(googleRoute.notes) ? googleRoute.notes : []),
              "Miles/geometry from OSRM; toll estimate from TollGuru."
            ];
          } else {
            payload.notes = [
              ...(Array.isArray(osrmRoute.notes) ? osrmRoute.notes : []),
              ...(Array.isArray(googleRoute.notes) ? googleRoute.notes : []),
              "Miles/geometry from OSRM; toll estimate from Google Routes."
            ];
          }
        } else if (googleRoute && osrmError) {
          payload.notes = [
            ...(Array.isArray(googleRoute.notes) ? googleRoute.notes : []),
            `OSRM fallback used Google route: ${String(osrmError?.message || "OSRM failed")}`
          ];
          if (tollFromTg) {
            payload.notes.push("Toll estimate from TollGuru.");
          }
        } else if (osrmRoute && tollFromTg) {
          payload.notes = [
            ...(Array.isArray(osrmRoute.notes) ? osrmRoute.notes : []),
            "Miles/geometry from OSRM; toll estimate from TollGuru."
          ];
        }

        if (tollFromTg && tollGuruVia === "origin-destination") {
          const extra =
            "TollGuru toll via origin–destination API (complete polyline / TollTally not available for this API key).";
          payload.notes = [...(Array.isArray(payload.notes) ? payload.notes : []), extra];
        }

        writeCache(storage, laneKey, payload);
        return payload;
      }

      const straightLineMiles = haversineMiles(originCoords, destinationCoords);
      const notes = [
        "Exact route lookup failed; using a road-adjusted crow-flight estimate.",
        String(osrmError?.message || "OSRM route lookup failed")
      ];
      if (googleError) {
        notes.push(`Google Routes toll lookup failed: ${String(googleError?.message || "unknown error")}`);
      } else if (!googleApiKey) {
        notes.push("Google Routes toll lookup disabled because API key is missing.");
      }
      const estimated = {
        laneKey,
        origin,
        destination,
        exactMiles: null,
        adjustedMiles: adjustedRoadMiles(straightLineMiles),
        routeOptionsCount: 1,
        routeSource: "Offline estimate",
        routeConfidence: "estimated",
        routeUrl: buildRouteUrl(originCoords, destinationCoords),
        tollStatus: "Unavailable",
        tollSource: "none",
        geocodeSources: [originCoords.source, destinationCoords.source],
        mapLineLatLngs: endpointLineLatLngs(originCoords, destinationCoords),
        notes
      };
      writeCache(storage, laneKey, estimated);
      return estimated;
    }

    const straightLineMiles = haversineMiles(originCoords, destinationCoords);
    const estimated = {
      laneKey,
      origin,
      destination,
      exactMiles: null,
      adjustedMiles: adjustedRoadMiles(straightLineMiles),
      routeOptionsCount: 1,
      routeSource: "Offline estimate",
      routeConfidence: "estimated",
      routeUrl: buildRouteUrl(originCoords, destinationCoords),
      tollStatus: "Unavailable",
      tollSource: "none",
      geocodeSources: [originCoords.source, destinationCoords.source],
      mapLineLatLngs: endpointLineLatLngs(originCoords, destinationCoords),
      notes: ["No live route source available; using a road-adjusted crow-flight estimate."]
    };
    writeCache(storage, laneKey, estimated);
    return estimated;
  }

  return {
    async inspectLane(originText, destinationText, options = {}) {
      const origin = parseCityState(originText);
      const destination = parseCityState(destinationText);

      if (!origin || !destination) {
        return buildUnavailableResult(origin, destination, "Could not parse the origin or destination.");
      }

      const laneKey = buildLaneKey(origin, destination);
      if (pending.has(laneKey)) {
        return pending.get(laneKey);
      }

      const task = computeLane(origin, destination, options).finally(() => {
        pending.delete(laneKey);
      });

      pending.set(laneKey, task);
      return task;
    }
  };
}
