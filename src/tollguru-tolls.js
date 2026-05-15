import { downsamplePolyline, encodePolylinePrecision5 } from "./polyline-encode.js";

export const TOLLGURU_COMPLETE_POLYLINE_URL =
  "https://apis.tollguru.com/toll/v2/complete-polyline-from-mapping-service";

/** Origin/destination tolls (TollGuru routing); see https://tollguru.com/toll-api-docs */
export const TOLLGURU_ORIGIN_DESTINATION_URL =
  "https://apis.tollguru.com/toll/v2/origin-destination-waypoints";

/** Keep request size reasonable for TollGuru polyline input */
export const TOLLGURU_MAX_ROUTE_POINTS = 600;

/**
 * @param {unknown} data Parsed TollGuru JSON
 * @returns {string} Human-readable toll line for the detail panel
 */
export function formatTollStatusFromTollGuruResponse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("TollGuru: empty response");
  }
  if (String(data.status || "").toUpperCase() !== "OK") {
    throw new Error(`TollGuru: status ${String(data.status)}`);
  }

  const route = data.route;
  if (!route || typeof route !== "object") {
    throw new Error("TollGuru: missing route");
  }

  if (!route.hasTolls) {
    return "No tolls reported";
  }

  const costs = route.costs && typeof route.costs === "object" ? route.costs : {};
  const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
  const currency =
    String(summary.currency || summary.units?.currencyUnit || "USD")
      .trim()
      .toUpperCase() || "USD";

  const pick = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const amount =
    pick(costs.minimumTollCost) ??
    pick(costs.tagAndCash) ??
    pick(costs.tag) ??
    pick(costs.cash) ??
    pick(costs.prepaidCard) ??
    null;

  if (amount === null) {
    return "Toll segments detected (estimate unavailable)";
  }

  const amountText = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${currency} ${amountText} est (TollGuru)`;
}

/**
 * @param {unknown} data Parsed TollGuru origin–destination JSON (top-level status OK, routes[]).
 * @returns {string} Human-readable toll line for the detail panel
 */
export function formatTollStatusFromOriginDestinationResponse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("TollGuru OD: empty response");
  }
  if (String(data.status || "").toUpperCase() !== "OK") {
    throw new Error(`TollGuru OD: status ${String(data.status)}`);
  }

  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (!routes.length) {
    throw new Error("TollGuru OD: no routes");
  }

  const topCurrency = String(data.summary?.currency || "USD")
    .trim()
    .toUpperCase() || "USD";

  const pick = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

  let bestAmount = null;
  let bestCurrency = topCurrency;
  let anyHasTolls = false;

  for (const r of routes) {
    const summary = r?.summary && typeof r.summary === "object" ? r.summary : {};
    const costs = r?.costs && typeof r.costs === "object" ? r.costs : {};
    if (summary.hasTolls !== true) {
      continue;
    }
    anyHasTolls = true;
    const amount =
      pick(costs.minimumTollCost) ??
      pick(costs.tagAndCash) ??
      pick(costs.tag) ??
      pick(costs.cash) ??
      pick(costs.prepaidCard) ??
      null;
    const cur =
      String(costs.currency || summary.currency || topCurrency)
        .trim()
        .toUpperCase() || topCurrency;
    if (amount !== null && (bestAmount === null || amount < bestAmount)) {
      bestAmount = amount;
      bestCurrency = cur;
    }
  }

  if (!anyHasTolls) {
    return "No tolls reported";
  }
  if (bestAmount === null) {
    return "Toll segments detected (estimate unavailable)";
  }

  const amountText = bestAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${bestCurrency} ${amountText} est (TollGuru)`;
}

/**
 * @param {Array<[number, number]>} mapLineLatLngs [lat, lng] pairs
 * @returns {Array<[number, number]>}
 */
export function preparePointsForTollGuru(mapLineLatLngs) {
  const pts = Array.isArray(mapLineLatLngs) ? mapLineLatLngs : [];
  const valid = pts.filter(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(Number(p[0])) &&
      Number.isFinite(Number(p[1]))
  );
  if (valid.length < 2) {
    return [];
  }
  return downsamplePolyline(valid, TOLLGURU_MAX_ROUTE_POINTS);
}

/**
 * @param {(url: string, init?: Record<string, unknown>) => Promise<unknown>} requestJson
 * @param {string} apiKey
 * @param {Array<[number, number]>} mapLineLatLngs
 * @param {{ mapProvider?: string, vehicleType?: string }} [options]
 * @returns {Promise<string>} tollStatus line
 */
export async function fetchTollGuruTollStatus(requestJson, apiKey, mapLineLatLngs, options = {}) {
  const key = String(apiKey || "").trim();
  if (!key || typeof requestJson !== "function") {
    throw new Error("TollGuru: missing key or requestJson");
  }

  const points = preparePointsForTollGuru(mapLineLatLngs);
  if (points.length < 2) {
    throw new Error("TollGuru: insufficient polyline points");
  }

  const polyline = encodePolylinePrecision5(points);
  if (!polyline) {
    throw new Error("TollGuru: empty encoded polyline");
  }

  const mapProvider = String(options.mapProvider || "osm").trim() || "osm";
  const vehicleType = String(options.vehicleType || "5AxlesTruck").trim() || "5AxlesTruck";

  const data = await requestJson(TOLLGURU_COMPLETE_POLYLINE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key
    },
    body: {
      mapProvider,
      polyline,
      vehicle: { type: vehicleType }
    }
  });

  return formatTollStatusFromTollGuruResponse(data);
}

/**
 * Toll for a lane using TollGuru’s origin–destination API (`serviceProvider: "tollguru"` per API docs).
 *
 * @param {(url: string, init?: Record<string, unknown>) => Promise<unknown>} requestJson
 * @param {string} apiKey
 * @param {string} originAddress e.g. "Newark, NJ"
 * @param {string} destinationAddress e.g. "Chicago, IL"
 * @param {{ vehicleType?: string }} [options]
 * @returns {Promise<string>} tollStatus line
 */
export async function fetchTollGuruOriginDestinationTolls(
  requestJson,
  apiKey,
  originAddress,
  destinationAddress,
  options = {}
) {
  const key = String(apiKey || "").trim();
  const from = String(originAddress || "").trim();
  const to = String(destinationAddress || "").trim();
  if (!key || !from || !to || typeof requestJson !== "function") {
    throw new Error("TollGuru OD: missing key, addresses, or requestJson");
  }

  const vehicleType = String(options.vehicleType || "5AxlesTruck").trim() || "5AxlesTruck";

  const data = await requestJson(TOLLGURU_ORIGIN_DESTINATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key
    },
    body: {
      from: { address: from },
      to: { address: to },
      serviceProvider: "tollguru",
      vehicle: { type: vehicleType }
    }
  });

  return formatTollStatusFromOriginDestinationResponse(data);
}

/**
 * Prefer TollTally complete polyline (matches OSRM/Google geometry); if that fails or is unavailable,
 * fall back to origin–destination (same key often works when polyline endpoint returns 403).
 *
 * @param {(url: string, init?: Record<string, unknown>) => Promise<unknown>} requestJson
 * @param {string} apiKey
 * @param {{ mapLineLatLngs?: Array<[number, number]> | null, originAddress?: string | null, destinationAddress?: string | null }} laneContext
 * @param {{ mapProvider?: string, vehicleType?: string }} [options]
 * @returns {Promise<{ tollStatus: string, via: "polyline" | "origin-destination" }>}
 */
export async function fetchTollGuruLaneTolls(requestJson, apiKey, laneContext, options = {}) {
  const { mapLineLatLngs, originAddress, destinationAddress } = laneContext;
  const from = String(originAddress ?? "").trim();
  const to = String(destinationAddress ?? "").trim();
  const polyOk = Array.isArray(mapLineLatLngs) && mapLineLatLngs.length >= 2;

  if (polyOk) {
    try {
      const tollStatus = await fetchTollGuruTollStatus(requestJson, apiKey, mapLineLatLngs, options);
      return { tollStatus, via: "polyline" };
    } catch {
      // Fall through to OD
    }
  }

  if (from && to) {
    const tollStatus = await fetchTollGuruOriginDestinationTolls(requestJson, apiKey, from, to, options);
    return { tollStatus, via: "origin-destination" };
  }

  throw new Error("TollGuru: polyline failed or missing, and origin/destination text missing");
}
