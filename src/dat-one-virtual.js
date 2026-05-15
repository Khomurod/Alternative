/**
 * DAT One "Search Loads" uses Angular CDK virtual scroll, not a semantic <table>.
 * Stable anchors discovered from saved DOM snapshots (Script.txt):
 * #table-viewport, data-test="results-table-body", .row-container, dat-route, dat-company.
 */

import { queryDeepAll } from "./dom-deep.js";
import {
  classifyBrokerSignals,
  evaluateRowAgainstTargets,
  parseCsDtpCell,
  parseRateCell,
  parseTripCell,
  parseWeightCell,
  resolveDisplayRpm,
  sanitizeLocationText
} from "./parsers.js";
import { DAT_EXT_GRID_ROW_MARK as ROW_MARK, buildRowDecorationStateKey, isActiveTargets } from "./row-deco-key.js";

export function findDatOneViewport(doc) {
  const selectors = [
    "#table-viewport",
    '[data-test="results-table-body"]',
    "cdk-virtual-scroll-viewport.table-rows-container",
    "cdk-virtual-scroll-viewport#table-viewport"
  ];

  for (const selector of selectors) {
    const hits = queryDeepAll(doc, selector);
    if (hits.length) {
      return /** @type {HTMLElement} */ (hits[0]);
    }
  }

  return null;
}

export function emptyScanSummary() {
  return {
    rowCount: 0,
    matched: 0,
    partial: 0,
    negotiate: 0,
    fail: 0,
    neutral: 0,
    risky: 0,
    averageRate: null,
    averageRpm: null
  };
}

function visibleText(element) {
  return String(element?.innerText || element?.textContent || "").trim();
}

function clearRowMarks(row) {
  row.classList.remove(
    `${ROW_MARK}`,
    `${ROW_MARK}--pass`,
    `${ROW_MARK}--fail`,
    `${ROW_MARK}--partial`,
    `${ROW_MARK}--negotiate`,
    `${ROW_MARK}--neutral`,
    `${ROW_MARK}--broker-strong`,
    `${ROW_MARK}--broker-ok`,
    `${ROW_MARK}--broker-risk`,
    `${ROW_MARK}--hidden`
  );
}

function bumpSummary(summary, status, brokerClass, rateDollars, rpm) {
  if (status === "pass") {
    summary.matched += 1;
  } else if (status === "partial") {
    summary.partial += 1;
  } else if (status === "negotiate") {
    summary.negotiate += 1;
  } else if (status === "fail") {
    summary.fail += 1;
  } else {
    summary.neutral += 1;
  }

  if (brokerClass === "risk") {
    summary.risky += 1;
  }

  if (rateDollars !== null) {
    summary._rateTotal = (summary._rateTotal || 0) + rateDollars;
    summary._rateCount = (summary._rateCount || 0) + 1;
  }

  if (rpm !== null) {
    summary._rpmTotal = (summary._rpmTotal || 0) + rpm;
    summary._rpmCount = (summary._rpmCount || 0) + 1;
  }
}

function finalizeSummary(summary) {
  summary.averageRate = summary._rateCount ? summary._rateTotal / summary._rateCount : null;
  summary.averageRpm = summary._rpmCount ? summary._rpmTotal / summary._rpmCount : null;
  delete summary._rateTotal;
  delete summary._rateCount;
  delete summary._rpmTotal;
  delete summary._rpmCount;
  return summary;
}

export function parseDatOneVirtualRow(row) {
  const route = row.querySelector("dat-route");
  const routeCell = row.querySelector('[data-test="load-origin-cell"]')?.closest(".route-dh-container") ?? route;

  const origin = sanitizeLocationText(
    routeCell?.querySelector('[data-test="load-origin-cell"]')?.textContent ??
      route?.querySelector(".route-dh-container-lg .origin .extended-trip-point")?.textContent ??
      route?.querySelector(".origin .extended-trip-point")?.textContent ??
      route?.querySelector(".origin span")?.textContent ??
      ""
  );

  const destination = sanitizeLocationText(
    routeCell?.querySelector('[data-test="load-destination-cell"]')?.textContent ??
      route?.querySelector(".route-dh-container-lg .destination .extended-trip-point")?.textContent ??
      route?.querySelector(".destination .extended-trip-point")?.textContent ??
      route?.querySelector(".destination span")?.textContent ??
      ""
  );

  const rateCell =
    row.querySelector('[data-test="load-rate-cell"]') ??
    row.querySelector(".cell-rate") ??
    row.querySelector("[class*='cell-rate']") ??
    row.querySelector("dat-rate");
  const tripCell =
    row.querySelector('[data-test="load-trip-cell"]') ??
    row.querySelector(".cell-trip") ??
    row.querySelector("[class*='cell-trip']") ??
    row.querySelector("dat-trip");
  const weightCell =
    row.querySelector('[data-test="load-weight-cell"]') ??
    row.querySelector(".cell-weight") ??
    row.querySelector("[class*='cell-weight']");

  const rateParsed = parseRateCell(visibleText(rateCell));
  const tripMiles = parseTripCell(visibleText(tripCell));

  const companyEl = row.querySelector("dat-company");
  const companyLines = visibleText(companyEl)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const companyName = companyLines.find((line) => line.length > 1 && !/^company$/i.test(line)) ?? "";

  const cells = [...row.querySelectorAll(".table-cell")];
  let contactText = "";
  let csText = "";

  for (const cell of cells) {
    const text = visibleText(cell);

    if (!contactText && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
      contactText = text;
    }

    if (!contactText && /\(\d{3}\)\s*\d{3}[-.]?\d{4}|\d{3}[-.]?\d{3}[-.]?\d{4}/.test(text)) {
      contactText = text;
    }

    if (!csText && /\d+\s*CS/i.test(text) && /\d+\s*DTP/i.test(text)) {
      csText = text;
    }

    if (contactText && csText) {
      break;
    }
  }

  const broker = parseCsDtpCell(csText);

  return {
    origin,
    destination,
    rateText: visibleText(rateCell),
    tripText: visibleText(tripCell),
    rateDollars: rateParsed.dollars,
    rpmHint: rateParsed.rpmHint,
    tripMiles,
    weightLbs: parseWeightCell(visibleText(weightCell)),
    companyName,
    contact: contactText,
    cs: broker.cs,
    dtp: broker.dtp
  };
}

export function decorateDatOneViewport(viewport, targets, options = {}) {
  if (!(viewport instanceof HTMLElement)) {
    return emptyScanSummary();
  }

  const wrapper = viewport.querySelector(".cdk-virtual-scroll-content-wrapper") ?? viewport;
  const rows = [...wrapper.querySelectorAll(".row-container")];

  if (!rows.length) {
    return emptyScanSummary();
  }

  const summary = emptyScanSummary();
  const activeTargets = isActiveTargets(targets);

  for (const row of rows) {
    if (!row.querySelector("dat-route, dat-company")) {
      continue;
    }

    summary.rowCount += 1;
    const parsed = parseDatOneVirtualRow(row);
    const status = evaluateRowAgainstTargets(targets, {
      rateDollars: parsed.rateDollars,
      tripMiles: parsed.tripMiles,
      rpmHint: parsed.rpmHint,
      weightLbs: parsed.weightLbs
    });

    const rpm = resolveDisplayRpm(parsed.rateDollars, parsed.tripMiles, parsed.rpmHint);
    const brokerClass = classifyBrokerSignals(parsed.cs, parsed.dtp);
    const decoKey = buildRowDecorationStateKey(parsed, status, brokerClass, targets, options, row, rpm);

    bumpSummary(summary, status, brokerClass, parsed.rateDollars, rpm);

    if (row.dataset.datExtDecoKey === decoKey) {
      continue;
    }

    row.dataset.datExtDecoKey = decoKey;
    clearRowMarks(row);

    row.classList.add(ROW_MARK, `${ROW_MARK}--${status}`);
    row.classList.add(`${ROW_MARK}--broker-${brokerClass}`);
    row.classList.toggle(`${ROW_MARK}--hidden`, Boolean(options.onlyMatches && activeTargets && status !== "pass"));

    const titleParts = [];
    titleParts.push(rpm !== null ? `RPM ~$${rpm.toFixed(2)}/mi` : "RPM unavailable");

    if (parsed.cs !== null || parsed.dtp !== null) {
      titleParts.push(`Broker ${parsed.cs ?? "?"} CS / ${parsed.dtp ?? "?"} DTP`);
    }

    titleParts.push(`Assist: ${status}`);
    row.title = titleParts.join(" | ");
  }

  return finalizeSummary(summary);
}
