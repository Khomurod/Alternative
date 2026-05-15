/**
 * When TollGuru has already failed, allow Google Routes toll numbers when fallback is appropriate.
 * HTTP 403 from TollGuru (quota/plan/endpoint denial) still warrants showing Google's toll estimate.
 * HTTP 401 is treated as credential rejection — skip substituting Google until the key issue is fixed.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function shouldFallbackTollToGoogle(error) {
  if (error == null || error === undefined) {
    return false;
  }
  const msg = String(
    /** @type {{ message?: string }} */ (error)?.message ?? error ?? ""
  ).toLowerCase();

  if (!msg.trim()) {
    return false;
  }

  if (/\b401\b/.test(msg)) {
    return false;
  }

  if (/\b403\b/.test(msg)) {
    return true;
  }

  if (/\b404\b/.test(msg)) {
    return true;
  }
  if (/\b408\b/.test(msg)) {
    return true;
  }
  if (/\b502\b|\b503\b|\b504\b/.test(msg)) {
    return true;
  }

  if (/timeout|timed out|abort|aborted|failed to fetch|networkerror|network request failed|net::err/i.test(msg)) {
    return true;
  }

  return false;
}
