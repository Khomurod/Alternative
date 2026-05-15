import { readSearchOriginText, extractPickupDeliveryFromLoadDetailHost } from "./detail-panel.js";
import {
  buildGoogleDirectionsUrl,
  extractLanePickupDeliveryFromDatRow,
  validateBuiltDirectionsUrlMatches
} from "./route-icon-directions.js";

/**
 * Directions URL using list/summary row only (trip-mile pin + route icons).
 *
 * @param {Document} doc
 * @param {Element} row
 * @returns {string|null}
 */
export function buildGoogleDirectionsUrlForRow(doc, row) {
  const lane = extractLanePickupDeliveryFromDatRow(row);
  return buildValidatedDirectionsUrl(doc, lane);
}

/**
 * Prefer expanded load detail extraction so B/C matches the Trip / Load Intelligence copy;
 * never depends on heuristic association to another row in the viewport.
 *
 * Optionally pass `listRowFallback` when `detailHost` is missing or incomplete (e.g. legacy DOM).
 *
 * @param {Document} doc
 * @param {{ detailHost?: HTMLElement | null, listRowFallback?: Element | null }} opts
 * @returns {string|null}
 */
export function buildGoogleDirectionsUrlForPin(doc, opts = {}) {
  const { detailHost = null, listRowFallback = null } = opts;
  /** @type {{ pickup: string, delivery: string } | null} */
  let lane = null;

  if (detailHost instanceof HTMLElement) {
    lane = extractPickupDeliveryFromLoadDetailHost(detailHost);
  }
  if (!lane && listRowFallback instanceof Element) {
    lane = extractLanePickupDeliveryFromDatRow(listRowFallback);
  }
  return buildValidatedDirectionsUrl(doc, lane);
}

/**
 * @param {Document} doc
 * @param {{ pickup: string, delivery: string } | null} lane
 */
function buildValidatedDirectionsUrl(doc, lane) {
  if (!lane) {
    return null;
  }
  const searchOrigin = readSearchOriginText(doc) || lane.pickup;
  const url = buildGoogleDirectionsUrl(searchOrigin, lane.pickup, lane.delivery);
  if (
    validateBuiltDirectionsUrlMatches(url, searchOrigin, lane.pickup, lane.delivery)
  ) {
    return url;
  }
  return null;
}
