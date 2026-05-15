/**
 * Pure parsing helpers for DAT One Search Loads grid cells (unit-tested).
 */

export function normalizeHeaderKey(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Map visible header labels to 0-based column indices.
 * @param {string[]} headerTexts
 * @returns {Record<string, number|null>}
 */
export function buildColumnMap(headerTexts) {
  const keys = headerTexts.map((h) => normalizeHeaderKey(h));
  const used = new Set();

  const take = (predicate) => {
    for (let i = 0; i < keys.length; i += 1) {
      if (used.has(i)) {
        continue;
      }
      if (predicate(keys[i], i)) {
        used.add(i);
        return i;
      }
    }
    return null;
  };

  const csDtp = take((k) => k.includes("cs") && (k.includes("dtp") || k.includes("days")));
  const map = {
    age: take((k) => k === "age"),
    rate: take((k) => k === "rate" || k === "pay" || k === "posted rate"),
    trip: take((k) => k === "trip" || k === "miles" || k.startsWith("distance")),
    origin: take((k) => k === "origin"),
    dhO: take((k) => k.replace(/\s/g, "") === "dh-o" || k.replace(/\s/g, "") === "dho" || k === "dh o"),
    destination: take((k) => k === "destination"),
    dhD: take((k) => k.replace(/\s/g, "") === "dh-d" || k.replace(/\s/g, "") === "dhd" || k === "dh d"),
    pickUp: take((k) => k.startsWith("pick up") || k === "pickup" || k === "pick"),
    eq: take((k) => k === "eq" || k === "equipment"),
    length: take((k) => k.startsWith("length")),
    weight: take((k) => k.startsWith("weight")),
    capacity: take((k) => k === "capacity" || k === "cap"),
    company: take((k) => k === "company"),
    contact: take((k) => k === "contact"),
    csDtp: csDtp ?? take((k) => k.includes("credit") || k.includes("days to pay"))
  };

  return map;
}

/**
 * @param {string} text
 * @returns {{ dollars: number|null, rpmHint: number|null }}
 */
export function parseRateCell(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { dollars: null, rpmHint: null };
  }

  const normalized = raw.replace(/[\u00a0*•·]/g, " ").replace(/\s+/g, " ").trim();
  const currencyMatches = [...normalized.matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));

  let dollars = null;
  for (const value of currencyMatches) {
    if (value >= 50) {
      dollars = value;
      break;
    }
  }

  const rpmMatch = normalized.match(/\$?\s*([0-9]+(?:\.\d+)?)\s*(?:\*?\s*\/\s*mi\b|per\s*mile\b)/i);
  let rpmHint = rpmMatch ? Number(rpmMatch[1]) : null;

  if (rpmHint === null && currencyMatches.length > 1) {
    const tail = currencyMatches[currencyMatches.length - 1];
    if (tail > 0 && tail < 20) {
      rpmHint = tail;
    }
  }

  if (
    dollars !== null &&
    rpmHint !== null &&
    Math.abs(dollars - rpmHint) < 1e-6
  ) {
    dollars = null;
  }

  return {
    dollars,
    rpmHint
  };
}

/**
 * @param {string} text
 * @returns {number|null}
 */
export function parseTripCell(text) {
  const raw = String(text || "").trim().replace(/,/g, "");
  if (!raw) {
    return null;
  }
  const match = raw.match(/\b(\d{2,5})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string} text
 * @returns {number|null}
 */
export function parseWeightCell(text) {
  const raw = String(text || "").trim().replace(/,/g, "");
  if (!raw) {
    return null;
  }

  const lbsMatch = raw.match(/\b(\d{3,6})\s*lbs?\b/i);
  if (lbsMatch) {
    return Number(lbsMatch[1]);
  }

  const genericMatch = raw.match(/\b(\d{3,6})\b/);
  return genericMatch ? Number(genericMatch[1]) : null;
}

/**
 * @param {string} text
 * @returns {{ cs: number|null, dtp: number|null }}
 */
export function parseCsDtpCell(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { cs: null, dtp: null };
  }

  let cs = null;
  let dtp = null;

  const csMatch = raw.match(/\b(\d{1,3})\s*cs\b/i);
  if (csMatch) {
    cs = Number(csMatch[1]);
  }

  const dtpMatch = raw.match(/\b(\d{1,3})\s*dtp\b/i);
  if (dtpMatch) {
    dtp = Number(dtpMatch[1]);
  }

  if (cs === null || dtp === null) {
    const pair = raw.match(/\b(\d{1,3})\s*[,/]\s*(\d{1,3})\b/);
    if (pair && cs === null) {
      cs = Number(pair[1]);
    }
    if (pair && dtp === null) {
      dtp = Number(pair[2]);
    }
  }

  return { cs, dtp };
}

/**
 * @param {string} text
 * @returns {string|null}
 */
export function extractEmail(text) {
  const match = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

/**
 * @param {string} text
 * @returns {string|null}
 */
export function extractPhone(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  return match ? match[0] : null;
}

/**
 * @param {number|null} rateDollars
 * @param {number|null} tripMiles
 * @param {number|null} rpmHint
 * @returns {number|null}
 */
export function resolveDisplayRpm(rateDollars, tripMiles, rpmHint) {
  if (rateDollars !== null && tripMiles !== null && tripMiles > 0) {
    return rateDollars / tripMiles;
  }
  if (rpmHint !== null && Number.isFinite(rpmHint)) {
    return rpmHint;
  }
  return null;
}

/**
 * RPM in load detail: use posted rate over OSRM or estimated miles when present, else DAT trip,
 * else broker per-mile hint. Prefers independent road miles over mirroring broker UI.
 *
 * @param {number|null} rateDollars
 * @param {number|null} datTripMiles
 * @param {number|null} roadMiles OSRM or estimated adjusted miles
 * @param {number|null} rpmHint
 * @returns {number|null}
 */
export function resolveDetailPanelRpm(rateDollars, datTripMiles, roadMiles, rpmHint) {
  const miles =
    roadMiles !== null && roadMiles !== undefined && Number.isFinite(roadMiles) && roadMiles > 0
      ? roadMiles
      : datTripMiles;
  if (rateDollars !== null && miles !== null && Number.isFinite(miles) && miles > 0 && rateDollars > 0) {
    return rateDollars / miles;
  }
  return resolveDisplayRpm(rateDollars, datTripMiles, rpmHint);
}

/**
 * @param {{ minRate: number|null, minRpm: number|null, maxMiles?: number|null, maxWeight?: number|null }} targets
 * @param {{ rateDollars: number|null, tripMiles: number|null, rpmHint: number|null, weightLbs?: number|null }} row
 * @returns {"neutral"|"negotiate"|"pass"|"fail"|"partial"}
 */
export function evaluateRowAgainstTargets(targets, row) {
  const minRate = targets.minRate !== null && targets.minRate > 0 ? targets.minRate : null;
  const minRpm = targets.minRpm !== null && targets.minRpm > 0 ? targets.minRpm : null;
  const maxMiles = targets.maxMiles !== null && targets.maxMiles > 0 ? targets.maxMiles : null;
  const maxWeight = targets.maxWeight !== null && targets.maxWeight > 0 ? targets.maxWeight : null;

  if (minRate === null && minRpm === null && maxMiles === null && maxWeight === null) {
    return "neutral";
  }

  const hasPostedRate =
    row.rateDollars !== null && Number.isFinite(row.rateDollars) && row.rateDollars > 0;
  if (!hasPostedRate) {
    return "fail";
  }

  const rpm = resolveDisplayRpm(row.rateDollars, row.tripMiles, row.rpmHint);

  const rateCheck = minRate === null ? null : row.rateDollars >= minRate;
  const rpmCheck = minRpm === null ? null : rpm === null ? null : rpm >= minRpm;
  const milesCheck = maxMiles === null ? null : row.tripMiles === null ? null : row.tripMiles <= maxMiles;
  const weightCheck = maxWeight === null ? null : row.weightLbs === null ? null : row.weightLbs <= maxWeight;

  if (minRpm !== null && rpm === null) {
    return "negotiate";
  }

  if (maxMiles !== null && row.tripMiles === null) {
    return "negotiate";
  }

  if (maxWeight !== null && row.weightLbs === null) {
    return "negotiate";
  }

  /** @type {boolean[]} */
  const outcomes = [];
  if (rateCheck !== null) {
    outcomes.push(rateCheck);
  }
  if (rpmCheck !== null) {
    outcomes.push(rpmCheck);
  }
  if (milesCheck !== null) {
    outcomes.push(milesCheck);
  }
  if (weightCheck !== null) {
    outcomes.push(weightCheck);
  }

  if (!outcomes.length) {
    return "neutral";
  }

  if (outcomes.every(Boolean)) {
    return "pass";
  }
  if (outcomes.some(Boolean)) {
    return "partial";
  }
  return "fail";
}

/**
 * @param {number|null} cs
 * @param {number|null} dtp
 * @returns {"strong"|"ok"|"risk"|"unknown"}
 */
export function classifyBrokerSignals(cs, dtp) {
  if (cs === null && dtp === null) {
    return "unknown";
  }
  if (cs !== null && cs < 70) {
    return "risk";
  }
  if (dtp !== null && dtp > 35) {
    return "risk";
  }
  if (cs !== null && cs >= 90 && dtp !== null && dtp <= 25) {
    return "strong";
  }
  return "ok";
}

export function sanitizeLocationText(text) {
  const raw = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return "";
  }

  const withoutPrefix = raw.replace(
    /^(?:trip|origin|destination|pickup|pick\s*up|drop(?:off)?|from|to|shipper|receiver)\s*[:\-]?\s*/i,
    ""
  );

  const withoutDeadhead = withoutPrefix
    .replace(/\(\s*\d+\s*\)/g, " ")
    .replace(/\bDH[\s\-]*(?:O|D)?\s*\d*\b/gi, " ")
    .replace(/\b\d+\s*(?:mi|miles?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedPunctuation = withoutDeadhead.replace(/[|•]/g, " ").replace(/\s+/g, " ").trim();
  const cityStateMatch = normalizedPunctuation.match(/([A-Za-z.' -]+),\s*([A-Z]{2})\b/i);

  if (cityStateMatch) {
    return `${cityStateMatch[1].trim()}, ${cityStateMatch[2].toUpperCase()}`;
  }

  return normalizedPunctuation;
}
