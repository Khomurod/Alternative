import { sanitizeLocationText } from "./parsers.js";

/**
 * List / virtual row extraction — aligned with {@link parseDatOneVirtualRow},
 * with terminal fallback to legacy `load-*-cell` / `.cell-*` anywhere on the row
 * (minimal test fixtures and non-grid shapes).
 *
 * @param {Element} row
 * @returns {{ pickup: string, delivery: string } | null}
 */
export function extractLanePickupDeliveryFromDatRow(row) {
  if (!(row instanceof Element)) {
    return null;
  }

  const route = row.querySelector("dat-route");
  const routeCell =
    row.querySelector('[data-test="load-origin-cell"]')?.closest(".route-dh-container") ?? route;

  let pickup = sanitizeLocationText(
    routeCell?.querySelector('[data-test="load-origin-cell"]')?.textContent ??
      route?.querySelector(".route-dh-container-lg .origin .extended-trip-point")?.textContent ??
      route?.querySelector(".origin .extended-trip-point")?.textContent ??
      route?.querySelector(".origin span")?.textContent ??
      ""
  );
  let delivery = sanitizeLocationText(
    routeCell?.querySelector('[data-test="load-destination-cell"]')?.textContent ??
      route?.querySelector(".route-dh-container-lg .destination .extended-trip-point")?.textContent ??
      route?.querySelector(".destination .extended-trip-point")?.textContent ??
      route?.querySelector(".destination span")?.textContent ??
      ""
  );

  if (!pickup) {
    pickup = sanitizeLocationText(
      row.querySelector('[data-test="load-origin-cell"]')?.textContent ||
        row.querySelector(".cell-origin")?.textContent ||
        ""
    );
  }
  if (!delivery) {
    delivery = sanitizeLocationText(
      row.querySelector('[data-test="load-destination-cell"]')?.textContent ||
        row.querySelector(".cell-destination")?.textContent ||
        ""
    );
  }

  if (!pickup || !delivery) {
    return null;
  }
  return { pickup, delivery };
}

/** @deprecated Prefer {@link extractLanePickupDeliveryFromDatRow} */
export function extractLaneFromRow(row) {
  return extractLanePickupDeliveryFromDatRow(row);
}

/**
 * Decode-safe comparison (Maps may re-serialize query encoding).
 *
 * @param {URLSearchParams} sp
 * @param {string} key
 * @returns {string}
 */
function normalizedMapsParam(sp, key) {
  return sanitizeLocationText(sp.get(key) ?? "");
}

/**
 * Middle leg uses `via:` so Maps treats it as a pass-through stop (stable vs bare address).
 *
 * @param {string} pickupSanitized
 */
export function formatDirectionsWaypointVia(pickupSanitized) {
  const p = sanitizeLocationText(pickupSanitized || "");
  if (!p) {
    return "";
  }
  return p.toLowerCase().startsWith("via:") ? p : `via:${p}`;
}

export function validateBuiltDirectionsUrlMatches(urlHref, searchRaw, pickup, delivery) {
  let u;
  try {
    u = new URL(urlHref);
  } catch {
    return false;
  }
  if (!u.href.startsWith("https://www.google.com/maps/dir/")) {
    return false;
  }
  const search = sanitizeLocationText(searchRaw || "");
  const originPoint = sanitizeLocationText(pickup || "");
  const destPoint = sanitizeLocationText(delivery || "");
  const abc = search && search.toLowerCase() !== originPoint.toLowerCase();

  if (abc) {
    const wpExpected = formatDirectionsWaypointVia(originPoint);
    const wpRaw = u.searchParams.get("waypoints") ?? "";
    const wpGotNorm = sanitizeLocationText(wpRaw);
    const wpStripVia = sanitizeLocationText(wpRaw.replace(/^via:\s*/i, ""));
    return (
      normalizedMapsParam(u.searchParams, "origin") === search &&
      (wpGotNorm === sanitizeLocationText(wpExpected) || wpStripVia === originPoint) &&
      normalizedMapsParam(u.searchParams, "destination") === destPoint
    );
  }
  return (
    normalizedMapsParam(u.searchParams, "origin") === originPoint &&
    normalizedMapsParam(u.searchParams, "destination") === destPoint
  );
}

export function buildGoogleDirectionsUrl(searchOrigin, pickup, delivery) {
  const search = sanitizeLocationText(searchOrigin || "");
  const originPoint = sanitizeLocationText(pickup || "");
  const destPoint = sanitizeLocationText(delivery || "");

  /** @type {URL} Official Maps directions entry point (waypoints survive redirects better than short links). */
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("travelmode", "driving");

  if (search && search.toLowerCase() !== originPoint.toLowerCase()) {
    url.searchParams.set("origin", search);
    url.searchParams.set("waypoints", formatDirectionsWaypointVia(originPoint));
    url.searchParams.set("destination", destPoint);
  } else {
    url.searchParams.set("origin", originPoint);
    url.searchParams.set("destination", destPoint);
  }

  return url.toString();
}
