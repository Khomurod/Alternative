import { findDatOneViewport } from "./dat-one-virtual.js";

const ROW_DIR_ATTR = "data-dat-ext-row-dir";
export const ROW_DIR_CONTEXT_ATTR = "data-dat-ext-row-dir-context";

const DIR_BTN_SVG = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M24 4C15.7157 4 9 10.7157 9 19C9 30.5 24 44 24 44C24 44 39 30.5 39 19C39 10.7157 32.2843 4 24 4Z" fill="#34A853"/>
  <path d="M24 12C20.134 12 17 15.134 17 19C17 22.866 20.134 26 24 26C27.866 26 31 22.866 31 19C31 15.134 27.866 12 24 12Z" fill="#FBBC05"/>
  <path d="M24 4C21.465 4 19.074 4.646 16.914 5.776L24 19L31.086 5.776C28.926 4.646 26.535 4 24 4Z" fill="#EA4335"/>
  <path d="M9 19C9 20.739 9.303 22.405 9.856 23.948L16.914 5.776C12.186 7.971 9 13.111 9 19Z" fill="#4285F4"/>
</svg>`;

/**
 * @param {ParentNode} row
 * @returns {HTMLElement | null}
 */
function findTripCell(row) {
  return (
    row.querySelector('[data-test="load-trip-cell"]') ??
    row.querySelector(".cell-trip")
  );
}

/**
 * @param {HTMLElement} tripCell
 * @returns {HTMLElement | null}
 */
function findTripMilesElement(tripCell) {
  const miles = tripCell.querySelector(".trip-miles");
  if (miles instanceof HTMLElement) {
    return miles;
  }
  return tripCell;
}

/**
 * @param {Document} doc
 * @param {HTMLElement} milesAnchor
 * @param {"list" | "detail"} context
 */
function createDirectionButton(doc, milesAnchor, context) {
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.setAttribute(ROW_DIR_ATTR, "1");
  btn.setAttribute(ROW_DIR_CONTEXT_ATTR, context);
  btn.className = "dat-ext-row-dir-btn";
  btn.title = "Open Google Maps directions (search origin → pickup → delivery)";
  btn.setAttribute("aria-label", "Open Google Maps directions");
  btn.innerHTML = DIR_BTN_SVG;

  if (milesAnchor.classList.contains("trip-miles")) {
    milesAnchor.insertAdjacentElement("afterend", btn);
  } else {
    milesAnchor.appendChild(btn);
  }
}

/**
 * Injects a small directions control after trip miles in DAT One virtual rows.
 * Idempotent per row (survives virtual scroll reuse when Angular replaces nodes).
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

    if (row.querySelector(`[${ROW_DIR_ATTR}][${ROW_DIR_CONTEXT_ATTR}="list"]`)) {
      continue;
    }

    const tripCell = findTripCell(row);
    if (!(tripCell instanceof HTMLElement)) {
      continue;
    }

    const milesAnchor = findTripMilesElement(tripCell);
    if (!(milesAnchor instanceof HTMLElement)) {
      continue;
    }

    createDirectionButton(doc, milesAnchor, "list");
  }
}

/**
 * Directions pin immediately left of trip miles in expanded load detail (`dat-load-details` header).
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
