/** chrome.storage.local key for TollGuru API key (never commit secrets). */
export const DAT_EXT_TOLLGURU_API_KEY = "datExtTollguruApiKey";

/** Default semi-truck profile for TollGuru vehicle.type */
export const DEFAULT_TOLLGURU_VEHICLE_TYPE = "5AxlesTruck";

/**
 * Optional bundled default when the popup has no key saved.
 * Popup value always wins when non-empty. Replace with your key if needed;
 * avoid committing real keys to public repositories.
 */
export const HARDCODED_TOLLGURU_API_KEY = "tg_B0FB9D6C300342C688D755047EA0D917";

/**
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
