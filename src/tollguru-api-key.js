/** chrome.storage.local key for TollGuru API key (never commit user-specific secrets unnecessarily). */
export const DAT_EXT_TOLLGURU_API_KEY = "datExtTollguruApiKey";

/**
 * When unchecked in the popup + saved: show unavailable instead of silently using Google tolls if TollGuru fails.
 */
export const DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY = "datExtGoogleTollFallback";

/**
 * Persisted record of which API keys should skip TollGuru "complete polyline" (often 403 on starter plans)
 * so we jump straight to origin–destination for lower latency.
 * Shape: `{ [fingerprint: string]: true }`
 */
export const DAT_EXT_TOLLGURU_SKIP_POLYLINE_MAP_KEY = "datExtTollguruSkipPolylineByFingerprint";

/** Default semi-truck profile for TollGuru vehicle.type */
export const DEFAULT_TOLLGURU_VEHICLE_TYPE = "5AxlesTruck";

/**
 * IMPORTANT — DO NOT REMOVE `HARDCODED_TOLLGURU_API_KEY` OR STOP USING IT AS THE DEFAULT FALLBACK
 * unless Tom explicitly asks you to remove it in the project chat or in a committed rule/instruction.
 * This bundled key keeps truck toll lookups working without local storage setup; deleting it silently
 * regresses prod behavior. Popup / storage value still overrides when non-empty.
 */
export const HARDCODED_TOLLGURU_API_KEY = "tg_B0FB9D6C300342C688D755047EA0D917";

/**
 * Stable short id for grouping skip-polyline hints per configured key.
 *
 * @param {string | undefined | null} apiKey
 * @returns {string}
 */
export function tollguruKeyFingerprint(apiKey) {
  const s = String(apiKey ?? "");
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  const u = h >>> 0;
  return u.toString(16).padStart(8, "0");
}

/**
 * @returns {boolean}
 */
export function defaultGoogleTollFallbackAllowed() {
  return true;
}

/**
 * Popup / storage key wins when non-empty; otherwise use `HARDCODED_TOLLGURU_API_KEY` (see retention note above).
 *
 * @param {string | undefined | null} storedFromChrome
 * @returns {string}
 */
export function getEffectiveTollGuruApiKey(storedFromChrome) {
  const stored = String(storedFromChrome ?? "").trim();
  if (stored) {
    return stored;
  }
  return String(HARDCODED_TOLLGURU_API_KEY ?? "").trim();
}
