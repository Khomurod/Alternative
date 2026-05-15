import { decorateDatOneViewport, emptyScanSummary, findDatOneViewport } from "./dat-one-virtual.js";
import { queryDeepAll } from "./dom-deep.js";
import {
  buildColumnMap,
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

export function findAriaHeaderRow(grid) {
  if (!(grid instanceof HTMLElement)) {
    return null;
  }

  const rows = [...grid.querySelectorAll('[role="row"]')].filter((row) => row.closest('[role="grid"], [role="treegrid"]') === grid);

  let bestRow = null;
  let bestCount = 0;

  for (const row of rows) {
    const headers = row.querySelectorAll('[role="columnheader"], th');
    if (headers.length > bestCount) {
      bestCount = headers.length;
      bestRow = row;
    }
  }

  return bestCount >= 4 ? bestRow : null;
}

export function scoreAriaGrid(grid) {
  if (!(grid instanceof HTMLElement)) {
    return 0;
  }

  const headerRow = findAriaHeaderRow(grid);
  if (!headerRow) {
    return 0;
  }

  const headerTexts = [...headerRow.querySelectorAll('[role="columnheader"], th')].map((cell) => normalizeDisplayHeader(cell));
  if (headerTexts.length < 4) {
    return 0;
  }

  const map = buildColumnMap(headerTexts);
  let score = 0;

  if (map.origin !== null) {
    score += 2;
  }
  if (map.destination !== null) {
    score += 2;
  }
  if (map.rate !== null) {
    score += 2;
  }
  if (map.trip !== null) {
    score += 1;
  }
  if (map.contact !== null) {
    score += 1;
  }
  if (map.company !== null) {
    score += 1;
  }

  const bodyRows = collectAriaBodyRows(grid, headerRow);
  if (bodyRows.length >= 2) {
    score += 1;
  }

  return score;
}

function collectAriaBodyRows(grid, headerRow) {
  const rows = [...grid.querySelectorAll('[role="row"]')].filter((row) => row.closest('[role="grid"], [role="treegrid"]') === grid);

  return rows.filter((row) => {
    if (row === headerRow) {
      return false;
    }

    if (row.querySelector('[role="columnheader"], th[scope="col"]')) {
      return false;
    }

    return Boolean(row.querySelector('[role="gridcell"], td'));
  });
}

export function scoreLoadsTable(table) {
  if (!(table instanceof HTMLTableElement)) {
    return 0;
  }

  const headerTexts = readTableHeaderTexts(table);
  if (headerTexts.length < 4) {
    return 0;
  }

  const map = buildColumnMap(headerTexts);
  let score = 0;
  if (map.origin !== null) {
    score += 2;
  }
  if (map.destination !== null) {
    score += 2;
  }
  if (map.rate !== null) {
    score += 2;
  }
  if (map.trip !== null) {
    score += 1;
  }
  if (map.contact !== null) {
    score += 1;
  }
  if (map.company !== null) {
    score += 1;
  }

  const bodyRows = table.tBodies.length ? table.tBodies[0].rows.length : 0;
  if (bodyRows >= 3) {
    score += 1;
  }

  return score;
}

/**
 * @param {Document} doc
 * @param {{ scope?: HTMLElement | null, allowDocumentDeepScan?: boolean }} [options]
 * @returns {HTMLElement | HTMLTableElement | null}
 */
export function findResultsGrid(doc, options = {}) {
  const { scope = null, allowDocumentDeepScan = true } = options;
  /** @type {HTMLElement[]} */
  const roots = [];

  if (scope instanceof HTMLElement) {
    roots.push(scope);
  }

  const body = doc.body || doc.documentElement;
  if (allowDocumentDeepScan && body instanceof HTMLElement) {
    roots.push(body);
  }

  if (!roots.length) {
    return null;
  }

  /** @type {{ score: number, surface: HTMLElement | HTMLTableElement | null }} */
  let winner = { score: 0, surface: null };

  const seenTables = new Set();
  for (const root of roots) {
    for (const table of queryDeepAll(root, "table")) {
      if (seenTables.has(table)) {
        continue;
      }
      seenTables.add(table);
      if (!(table instanceof HTMLTableElement)) {
        continue;
      }

      const score = scoreLoadsTable(table);
      if (score > winner.score) {
        winner = { score, surface: table };
      }
    }
  }

  const seenGrids = new Set();
  /** @type {Element[]} */
  const grids = [];
  for (const root of roots) {
    for (const grid of queryDeepAll(root, '[role="grid"]')) {
      if (!seenGrids.has(grid)) {
        seenGrids.add(grid);
        grids.push(grid);
      }
    }
    for (const grid of queryDeepAll(root, '[role="treegrid"]')) {
      if (!seenGrids.has(grid)) {
        seenGrids.add(grid);
        grids.push(grid);
      }
    }
  }

  for (const grid of grids) {
    if (!(grid instanceof HTMLElement)) {
      continue;
    }

    const score = scoreAriaGrid(grid);
    if (score > winner.score) {
      winner = { score, surface: grid };
    }
  }

  if (!winner.surface || winner.score < 4) {
    return null;
  }

  return winner.surface;
}

export function readTableHeaderTexts(table) {
  const thead = table.querySelector("thead");
  const headerRow =
    (thead && thead.querySelector("tr")) ||
    table.querySelector("tr:scope > th")?.closest("tr") ||
    table.rows[0];

  if (!headerRow) {
    return [];
  }

  const cells = [...headerRow.querySelectorAll("th, td")];
  return cells.map((cell) => normalizeDisplayHeader(cell));
}

function normalizeDisplayHeader(cell) {
  const text = (cell.innerText || cell.textContent || "").replace(/\u00a0/g, " ").trim();
  return text.split("\n")[0].trim();
}

function readRowCells(row) {
  return [...row.querySelectorAll("th, td")];
}

function parseRowFromCells(cells, columnMap) {
  const pick = (idx) => (idx === null || idx === undefined ? "" : cells[idx] ? cells[idx].innerText || cells[idx].textContent || "" : "");

  const rateText = pick(columnMap.rate);
  const tripText = pick(columnMap.trip);
  const rateParsed = parseRateCell(rateText);
  const tripMiles = parseTripCell(tripText);

  const csText = pick(columnMap.csDtp);
  const broker = parseCsDtpCell(csText);

  return {
    origin: sanitizeLocationText(pick(columnMap.origin)),
    destination: sanitizeLocationText(pick(columnMap.destination)),
    rateText: rateText.trim(),
    tripText: tripText.trim(),
    rateDollars: rateParsed.dollars,
    rpmHint: rateParsed.rpmHint,
    tripMiles,
    weightLbs: parseWeightCell(pick(columnMap.weight)),
    company: pick(columnMap.company).trim(),
    contact: pick(columnMap.contact).trim(),
    cs: broker.cs,
    dtp: broker.dtp
  };
}

function collectTableBodyRows(table) {
  if (table.tBodies.length) {
    return [...table.tBodies].flatMap((body) => [...body.rows]);
  }

  if (table.tHead) {
    return [...table.rows].slice(table.tHead.rows.length);
  }

  return [...table.rows].slice(1);
}

export function decorateLoadsTable(table, targets, options = {}) {
  if (!(table instanceof HTMLTableElement)) {
    return emptyScanSummary();
  }

  const headerTexts = readTableHeaderTexts(table);
  const columnMap = buildColumnMap(headerTexts);
  if (columnMap.origin === null || columnMap.destination === null) {
    return emptyScanSummary();
  }

  const rows = collectTableBodyRows(table);
  const summary = emptyScanSummary();
  const activeTargets = isActiveTargets(targets);

  for (const row of rows) {
    if (row.closest("thead")) {
      continue;
    }

    const cells = readRowCells(row);
    if (cells.length < 4) {
      continue;
    }

    summary.rowCount += 1;
    const parsed = parseRowFromCells(cells, columnMap);
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

export function decorateAriaGrid(grid, targets, options = {}) {
  if (!(grid instanceof HTMLElement)) {
    return emptyScanSummary();
  }

  const headerRow = findAriaHeaderRow(grid);
  if (!headerRow) {
    return emptyScanSummary();
  }

  const headerCells = [...headerRow.querySelectorAll('[role="columnheader"], th')];
  const headerTexts = headerCells.map((cell) => normalizeDisplayHeader(cell));
  const columnMap = buildColumnMap(headerTexts);
  if (columnMap.origin === null || columnMap.destination === null) {
    return emptyScanSummary();
  }

  const summary = emptyScanSummary();
  const bodyRows = collectAriaBodyRows(grid, headerRow);
  const activeTargets = isActiveTargets(targets);

  for (const row of bodyRows) {
    const cells = [...row.querySelectorAll('[role="gridcell"], td')];
    if (cells.length < 4) {
      continue;
    }

    summary.rowCount += 1;
    const parsed = parseRowFromCells(cells, columnMap);
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
    titleParts.push(`Assist: ${status}`);
    row.title = titleParts.join(" | ");
  }

  return finalizeSummary(summary);
}

export function scanDocumentForGrids(doc, targets, options = {}) {
  const {
    scanScope = null,
    allowDocumentDeepScan = true,
    cachedViewport = null
  } = options;

  const viewportOptions = { scope: scanScope, allowDocumentDeepScan };
  let datViewport =
    cachedViewport instanceof HTMLElement && cachedViewport.isConnected ? cachedViewport : null;

  if (!datViewport) {
    datViewport = findDatOneViewport(doc, viewportOptions);
  }

  if (datViewport) {
    const virtualSummary = decorateDatOneViewport(datViewport, targets, options);

    if (virtualSummary.rowCount > 0) {
      return virtualSummary;
    }
  }

  if (!allowDocumentDeepScan && !(scanScope instanceof HTMLElement)) {
    return emptyScanSummary();
  }

  const surface = findResultsGrid(doc, viewportOptions);

  if (surface instanceof HTMLTableElement) {
    return decorateLoadsTable(surface, targets, options);
  }

  if (surface instanceof HTMLElement) {
    const role = surface.getAttribute("role");
    if (role === "grid" || role === "treegrid") {
      return decorateAriaGrid(surface, targets, options);
    }
  }

  return emptyScanSummary();
}
