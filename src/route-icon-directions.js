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
  const search = sanitizeLocationText(searchOrigin || "");
  const originPoint = sanitizeLocationText(pickup || "");
  const destPoint = sanitizeLocationText(delivery || "");

  const url = new URL("https://www.google.com/maps/dir/?api=1");
  url.searchParams.set("travelmode", "driving");

  if (search && search.toLowerCase() !== originPoint.toLowerCase()) {
    url.searchParams.set("origin", search);
    url.searchParams.set("waypoints", originPoint);
    url.searchParams.set("destination", destPoint);
  } else {
    url.searchParams.set("origin", originPoint);
    url.searchParams.set("destination", destPoint);
  }

  return url.toString();
}
