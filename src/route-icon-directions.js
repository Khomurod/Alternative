import { sanitizeLocationText } from "./parsers.js";

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
  const origin = search || sanitizeLocationText(pickup);
  const pickupPoint = sanitizeLocationText(pickup);
  const destination = sanitizeLocationText(delivery);

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", "driving");
  if (pickupPoint && origin.toLowerCase() !== pickupPoint.toLowerCase()) {
    url.searchParams.set("waypoints", pickupPoint);
  }
  return url.toString();
}
