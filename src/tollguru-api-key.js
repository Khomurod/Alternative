/** chrome.storage.local key for TollGuru API key (never commit secrets). */
export const DAT_EXT_TOLLGURU_API_KEY = "datExtTollguruApiKey";

/** Default semi-truck profile for TollGuru vehicle.type */
export const DEFAULT_TOLLGURU_VEHICLE_TYPE = "5AxlesTruck";

/**
 * @param {string | undefined | null} storedFromChrome
 * @returns {string}
 */
export function getEffectiveTollGuruApiKey(storedFromChrome) {
  return String(storedFromChrome ?? "").trim();
}
