import { readSearchOriginText } from "./detail-panel.js";
import { buildGoogleDirectionsUrl, extractLaneFromRow } from "./route-icon-directions.js";

/**
 * @param {Document} doc
 * @param {Element} row
 * @returns {string|null}
 */
export function buildGoogleDirectionsUrlForRow(doc, row) {
  const lane = extractLaneFromRow(row);
  if (!lane) {
    return null;
  }
  const searchOrigin = readSearchOriginText(doc) || lane.pickup;
  return buildGoogleDirectionsUrl(searchOrigin, lane.pickup, lane.delivery);
}
