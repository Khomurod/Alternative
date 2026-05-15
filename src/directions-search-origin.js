import { sanitizeLocationText } from "./parsers.js";

/** Session-scoped last board search origin (survives missed DOM reads after virtual scroll). */
export const DAT_EXT_LAST_SEARCH_ORIGIN_SESSION_KEY = "dat-ext-last-search-origin-v1";

/**
 * Live DAT origin → session cache → empty (never substitutes pickup; callers build A–C when empty).
 *
 * @param {Document} doc
 * @param {(d: Document) => string} readSearchOriginText
 * @returns {string}
 */
export function persistAndResolveDirectionsSearchOrigin(doc, readSearchOriginText) {
  const live = String(readSearchOriginText(doc) || "").trim();
  let persisted = "";
  try {
    persisted = String(globalThis.sessionStorage?.getItem(DAT_EXT_LAST_SEARCH_ORIGIN_SESSION_KEY) ?? "").trim();
  } catch {
    persisted = "";
  }

  if (live) {
    try {
      globalThis.sessionStorage?.setItem(DAT_EXT_LAST_SEARCH_ORIGIN_SESSION_KEY, live);
    } catch {
      /* quota / privacy mode */
    }
    return live;
  }

  return sanitizeLocationText(persisted);
}

