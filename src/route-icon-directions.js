import { sanitizeLocationText } from "./parsers.js";
import { normalizeCityStateKey, parseCityState } from "./routing.js";

export function extractLaneFromRow(row) {
  if (!(row instanceof Element)) {
    return null;
  }

  const pickup = sanitizeLocationText(
    row.querySelector('[data-test="load-origin-cell"]')?.textContent ||
      row.querySelector(".cell-origin")?.textContent ||
      ""
  );
  const delivery = sanitizeLocationText(
    row.querySelector('[data-test="load-destination-cell"]')?.textContent ||
      row.querySelector(".cell-destination")?.textContent ||
      ""
  );

  if (!pickup || !delivery) {
    return null;
  }
  return { pickup, delivery };
}

export function buildGoogleDirectionsUrl(searchOrigin, pickup, delivery) {
  const search = sanitizeLocationText(searchOrigin);
  const pickupPoint = sanitizeLocationText(pickup);
  const destination = sanitizeLocationText(delivery);

  const origin = search || pickupPoint;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", "driving");

  const searchLoc = parseCityState(search);
  const pickupLoc = parseCityState(pickupPoint);
  const sameOrigin =
    searchLoc &&
    pickupLoc &&
    normalizeCityStateKey(searchLoc.city, searchLoc.state) === normalizeCityStateKey(pickupLoc.city, pickupLoc.state);

  if (pickupPoint && !sameOrigin && search) {
    url.searchParams.set("waypoints", pickupPoint);
  }

  return url.toString();
}
