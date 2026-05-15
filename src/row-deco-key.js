/**
 * Stable key for idempotent grid row decoration (avoids DOM churn / flicker).
 */

export const DAT_EXT_GRID_ROW_MARK = "dat-ext-grid-row";

export function isActiveTargets(targets) {
  return (
    (targets.minRate ?? 0) > 0 ||
    (targets.minRpm ?? 0) > 0 ||
    (targets.maxMiles ?? 0) > 0 ||
    (targets.maxWeight ?? 0) > 0
  );
}

/**
 * @param {object} parsed
 * @param {string} status
 * @param {string} brokerClass
 * @param {{ minRate: number|null, minRpm: number|null, maxMiles?: number|null, maxWeight?: number|null }} targets
 * @param {{ onlyMatches?: boolean }} options
 * @param {HTMLElement} row
 * @param {number|null} rpm
 */
export function buildRowDecorationStateKey(parsed, status, brokerClass, targets, options, row, rpm) {
  const active = isActiveTargets(targets);
  const hidden = Boolean(options.onlyMatches && active && status !== "pass");
  const id = row instanceof HTMLElement && row.id ? row.id : "";
  return [
    id,
    status,
    brokerClass,
    parsed.rateDollars ?? "",
    parsed.tripMiles ?? "",
    parsed.rpmHint ?? "",
    targets.minRate ?? "",
    targets.minRpm ?? "",
    targets.maxMiles ?? "",
    targets.maxWeight ?? "",
    options.onlyMatches ? "1" : "0",
    hidden ? "1" : "0",
    rpm !== null && Number.isFinite(rpm) ? rpm.toFixed(4) : ""
  ].join("|");
}
