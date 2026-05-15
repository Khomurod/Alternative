import { findDatOneViewport } from "./dat-one-virtual.js";

const ROW_DIR_ATTR = "data-dat-ext-row-dir";
export const ROW_DIR_CONTEXT_ATTR = "data-dat-ext-row-dir-context";

/** Pin icon (inline SVG) — subtle, no external assets */
const DIR_BTN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z"/><circle cx="12" cy="11" r="2.5" fill="currentColor" stroke="none"/></svg>';

/**
 * Injects a small directions control next to trip miles in DAT One virtual rows.
 * Idempotent per `dat-route` (survives virtual scroll reuse when Angular replaces nodes).
 *
 * @param {Document} doc
 */
export function injectRowSummaryDirectionAnchors(doc) {
  const viewport = findDatOneViewport(doc);
  if (!viewport) {
    return;
  }

  const wrapper = viewport.querySelector(".cdk-virtual-scroll-content-wrapper") ?? viewport;

  for (const row of wrapper.querySelectorAll(".row-container")) {
    if (!(row instanceof HTMLElement)) {
      continue;
    }

    const route = row.querySelector(".row-cells dat-route") ?? row.querySelector("dat-route");
    if (!(route instanceof HTMLElement)) {
      continue;
    }

    if (route.querySelector(`[${ROW_DIR_ATTR}]`)) {
      continue;
    }

    const tripIcon = route.querySelector(".trip-icon-container");
    const miles = route.querySelector(".trip-miles");

    /** @type {HTMLElement | null} */
    let insertParent = null;
    /** @type {ChildNode | null} */
    let insertBefore = null;

    if (tripIcon instanceof HTMLElement) {
      insertParent = tripIcon;
      insertBefore = tripIcon.firstChild;
    } else if (miles?.parentElement instanceof HTMLElement) {
      insertParent = miles.parentElement;
      insertBefore = miles;
    } else {
      continue;
    }

    const btn = doc.createElement("button");
    btn.type = "button";
    btn.setAttribute(ROW_DIR_ATTR, "1");
    btn.setAttribute(ROW_DIR_CONTEXT_ATTR, "list");
    btn.className = "dat-ext-row-dir-btn";
    btn.title = "Open Google Maps directions (search origin → pickup → delivery)";
    btn.setAttribute("aria-label", "Open Google Maps directions");
    btn.innerHTML = DIR_BTN_SVG;

    insertParent.insertBefore(btn, insertBefore);
  }
}

/**
 * Directions pin next to trip miles in expanded load detail (`dat-load-details` header).
 * Idempotent per host. Uses the same button pattern as list rows.
 *
 * @param {Document} doc
 */
export function injectLoadDetailDirectionAnchors(doc) {
  for (const host of doc.querySelectorAll("dat-load-details")) {
    if (!(host instanceof HTMLElement) || !host.isConnected) {
      continue;
    }

    if (host.querySelector(`[${ROW_DIR_ATTR}][${ROW_DIR_CONTEXT_ATTR}="detail"]`)) {
      continue;
    }

    const miles =
      host.querySelector("dat-details-header .trip-miles") ??
      host.querySelector("dat-details-header .details-header_info .trip-miles");
    if (!(miles instanceof HTMLElement)) {
      continue;
    }

    const insertParent = miles.parentElement;
    if (!(insertParent instanceof HTMLElement)) {
      continue;
    }

    const btn = doc.createElement("button");
    btn.type = "button";
    btn.setAttribute(ROW_DIR_ATTR, "1");
    btn.setAttribute(ROW_DIR_CONTEXT_ATTR, "detail");
    btn.className = "dat-ext-row-dir-btn";
    btn.title = "Open Google Maps directions (search origin → pickup → delivery)";
    btn.setAttribute("aria-label", "Open Google Maps directions");
    btn.innerHTML = DIR_BTN_SVG;

    insertParent.insertBefore(btn, miles);
  }
}

export { ROW_DIR_ATTR };
