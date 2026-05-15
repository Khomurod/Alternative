import {
  extractEmail,
  parseCsDtpCell,
  parseRateCell,
  parseTripCell,
  sanitizeLocationText
} from "./parsers.js";
import { destroyLaneMap } from "./numeo-map.js";
import { inspectDispatcherM3Route } from "./routing.js";
import {
  buildAssistRowWrapper,
  findRateInsertion,
  removeAllTomRows,
  renderColumn,
  TOM_COLUMN_CLASS,
  TOM_PANEL_CLASS,
  TOM_ROW_CLASS
} from "./numeo-column.js";

function visibleText(element) {
  return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
}

function looksLikeCompanyName(text) {
  return /\b(logistics|freight|transport|trucking|solutions|broker|sales|carrier|shipping|express|inc|llc|corp|co)\b/i.test(
    text
  );
}

export function readSearchOriginText(doc) {
  if (!doc?.querySelector) {
    return "";
  }
  const root = doc.body || doc;
  const selectors = [
    'dat-search-location[data-test="origin-input"] input',
    '[data-test="origin-input"] input',
    'input[aria-label*="Origin"]',
    "#origin-automation input",
    "input#origin-automation",
    "dat-search-location#origin-automation input",
    '[locationtestid="origin-input"] input',
    "dat-search-location[locationtestid='origin-input'] input"
  ];
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el instanceof HTMLInputElement) {
      const v = (el.value || "").trim();
      if (v) {
        return sanitizeLocationText(v);
      }
    }
  }
  const fallback = root.querySelector("dat-search-location input");
  if (fallback instanceof HTMLInputElement) {
    const v = (fallback.value || "").trim();
    if (v) {
      return sanitizeLocationText(v);
    }
  }
  return "";
}

function findSummaryRow(detailHost) {
  const detailRow = detailHost.closest(".table-row-detail");
  const rowContainer = detailRow?.closest(".row-container") ?? detailHost.closest(".row-container");
  const rowMarkers =
    "dat-company, dat-route, [data-test='load-origin-cell'], [data-test='load-destination-cell'], .table-cell";

  if (rowContainer instanceof HTMLElement) {
    const rowCells = rowContainer.querySelector(".row-cells") ?? rowContainer;
    if (rowCells.querySelector(rowMarkers)) {
      return rowCells;
    }
  }

  let current = (detailRow ?? detailHost)?.previousElementSibling ?? null;
  while (current instanceof HTMLElement) {
    if (current.matches(".row-container") || current.querySelector(rowMarkers)) {
      return current;
    }
    current = current.previousElementSibling;
  }

  return null;
}

/**
 * Summary row / container used for lane cells (origin/destination), same as Load Intelligence uses.
 * @param {Element} detailHost Usually `dat-load-details`.
 * @returns {HTMLElement | null}
 */
export function findLaneRowFromLoadDetails(detailHost) {
  if (!(detailHost instanceof Element)) {
    return null;
  }
  const row = findSummaryRow(detailHost);
  return row instanceof HTMLElement ? row : null;
}

function readBrokerMetrics(host) {
  const companyBlock =
    host.querySelector('[data-test="company-details-container"]') ?? host.querySelector("dat-company") ?? host;
  const text = visibleText(companyBlock);

  if (/credit score/i.test(text) || /days to pay/i.test(text)) {
    const creditMatch = text.match(/credit score\s*(\d{1,3})/i);
    const dtpMatch = text.match(/days to pay\s*(\d{1,3})/i);
    return {
      cs: creditMatch ? Number(creditMatch[1]) : null,
      dtp: dtpMatch ? Number(dtpMatch[1]) : null
    };
  }

  if (/\d+\s*CS/i.test(text) || /\d+\s*DTP/i.test(text)) {
    return parseCsDtpCell(text);
  }

  return { cs: null, dtp: null };
}

function readCompanyName(host) {
  const candidates = [
    host.querySelector('[data-test="company-details-container"] .company'),
    host.querySelector("dat-company .company"),
    host.querySelector("dat-company .truncate.company")
  ];

  for (const candidate of candidates) {
    const text = visibleText(candidate);
    if (text && !/@/.test(text)) {
      return text;
    }
  }

  const summaryRow = findSummaryRow(host);
  if (summaryRow) {
    const summaryCandidates = [
      visibleText(summaryRow.querySelector("dat-company .company")),
      visibleText(summaryRow.querySelector("dat-company")),
      ...[...summaryRow.querySelectorAll(".table-cell, [data-test='load-company-cell']")].map((element) =>
        visibleText(element)
      )
    ]
      .flatMap((text) => text.split(/\n/))
      .map((text) => text.trim())
      .filter(Boolean);

    for (const candidate of summaryCandidates) {
      if (!/@/.test(candidate) && !/\b\d+\s*(?:CS|DTP)\b/i.test(candidate) && looksLikeCompanyName(candidate)) {
        return candidate;
      }
    }

    for (const candidate of summaryCandidates) {
      if (!/@/.test(candidate) && !/\b\d+\s*(?:CS|DTP)\b/i.test(candidate) && !/, [A-Z]{2}\b/.test(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

function readDetailTripMiles(host) {
  const text =
    visibleText(host.querySelector("dat-route .trip-miles")) ||
    visibleText(host.querySelector('[data-test="route-details"] .trip-miles')) ||
    visibleText(host.querySelector(".details-subheader-mileage .trip-miles")) ||
    visibleText(host.querySelector(".trip-miles")) ||
    visibleText(host.querySelector('[data-test="rate-details-container"]'));
  return parseTripCell(text);
}

function readDetailRate(host) {
  const rateContainer = host.querySelector('[data-test="rate-details-container"]');
  if (!rateContainer) {
    return { dollars: null, rpmHint: null };
  }

  const summaryRow = findSummaryRow(host);
  const summaryRateText =
    visibleText(summaryRow?.querySelector('[data-test="load-rate-cell"]')) ||
    visibleText(summaryRow?.querySelector(".cell-rate")) ||
    "";

  const detailRateText = [
    ...rateContainer.querySelectorAll(
      ".rate-data .data-item, .rate-data .data-item-ratemiles, .data-item, .data-item-ratemiles"
    )
  ]
    .map((element) => visibleText(element))
    .filter(Boolean)
    .join(" ");

  return parseRateCell(detailRateText || summaryRateText || visibleText(rateContainer));
}

export function extractLoadDetailData(detailHost) {
  const routeDetails = detailHost.querySelector('[data-test="route-details"]');
  const summaryRow = findSummaryRow(detailHost);
  const cityNodes = routeDetails ? [...routeDetails.querySelectorAll(".city, .extended-trip-point")] : [];

  const origin = sanitizeLocationText(
    cityNodes[0]?.textContent ||
      detailHost.querySelector("dat-route .origin .extended-trip-point")?.textContent ||
      summaryRow?.querySelector('[data-test="load-origin-cell"]')?.textContent ||
      summaryRow?.querySelector("dat-route .origin .extended-trip-point")?.textContent ||
      ""
  );
  const destination = sanitizeLocationText(
    cityNodes[1]?.textContent ||
      detailHost.querySelector("dat-route .destination .extended-trip-point")?.textContent ||
      summaryRow?.querySelector('[data-test="load-destination-cell"]')?.textContent ||
      summaryRow?.querySelector("dat-route .destination .extended-trip-point")?.textContent ||
      ""
  );

  const tripMiles = readDetailTripMiles(detailHost);
  const rate = readDetailRate(detailHost);

  const email =
    extractEmail(visibleText(detailHost.querySelector('.contact-methods a[href^="mailto:"]'))) ||
    extractEmail(visibleText(detailHost.querySelector('a[href^="mailto:"]'))) ||
    extractEmail(visibleText(summaryRow)) ||
    null;

  let broker = readBrokerMetrics(detailHost);
  if (broker.cs === null && broker.dtp === null && summaryRow) {
    broker = parseCsDtpCell(visibleText(summaryRow));
  }

  return {
    origin,
    destination,
    tripMiles,
    rateDollars: rate.dollars,
    rpmHint: rate.rpmHint,
    companyName: readCompanyName(detailHost),
    contactEmail: email,
    cs: broker.cs,
    dtp: broker.dtp
  };
}

function teardownDetailUi(detailHost) {
  if (!(detailHost instanceof HTMLElement)) return;
  removeAllTomRows(detailHost);
  for (const stalePanel of detailHost.querySelectorAll(`.${TOM_PANEL_CLASS}`)) {
    if (stalePanel.__datExtMap) {
      destroyLaneMap(stalePanel.__datExtMap);
      stalePanel.__datExtMap = null;
    }
    stalePanel.remove();
  }
  detailHost.classList.remove("dat-ext-injected");
}

export function findLoadDetailHosts(doc) {
  if (!doc?.querySelectorAll) return [];
  return [...doc.querySelectorAll("dat-load-details")].filter((host) => host instanceof HTMLElement);
}

function ensureAssistMount(detailHost) {
  const insertion = findRateInsertion(detailHost);
  if (!insertion) {
    teardownDetailUi(detailHost);
    return null;
  }

  const { mode, parent, before } = insertion;
  const matchSelector = mode === "column-before" ? `.${TOM_COLUMN_CLASS}` : `.${TOM_ROW_CLASS}`;

  let existing = detailHost.querySelector(matchSelector);

  // If a stale wrapper exists with no live shadow root (e.g. DAT re-rendered the subtree
  // via cloneNode/Angular *ngIf), discard it and re-inject in the same scan.
  if (existing) {
    const staleHost = existing.querySelector(`.${TOM_PANEL_CLASS}`);
    if (!staleHost || !staleHost.shadowRoot || !staleHost.shadowRoot.querySelector(".card")) {
      existing.remove();
      existing = null;
    }
  }

  if (existing && (existing.parentElement !== parent || existing.nextElementSibling !== before)) {
    parent.insertBefore(existing, before);
  }

  if (!existing) {
    teardownDetailUi(detailHost);
    const { wrapper } = buildAssistRowWrapper(mode, document);
    parent.insertBefore(wrapper, before);
    existing = wrapper;
  }

  detailHost.classList.add("dat-ext-injected");

  const host = existing.querySelector(`.${TOM_PANEL_CLASS}`);
  const shadow = host?.shadowRoot ?? null;
  const card = shadow?.querySelector(".card") ?? null;
  if (!host || !shadow || !card) {
    teardownDetailUi(detailHost);
    return null;
  }

  return { host, shadow, card };
}

function safeRender(host, card, data, route, loadingRoute, offerTpl, bookingTpl, templateMode, onRefreshRoute, renderExtras = {}) {
  if (host.__datExtMap) {
    destroyLaneMap(host.__datExtMap);
    host.__datExtMap = null;
  }
  const ctx = {
    shadowHost: host,
    data,
    route,
    loadingRoute,
    offerTpl,
    bookingTpl,
    templateMode,
    onRefreshRoute,
    userAccountEmail: renderExtras.userAccountEmail ?? "",
    onRequestGoogleLogin: renderExtras.onRequestGoogleLogin ?? null,
    mapInstance: null
  };
  renderColumn(card, ctx);
  host.__datExtMap = ctx.mapInstance ?? null;
}

export function enhanceLoadDetails(doc, context) {
  if (!doc || !context) return;
  const hosts = findLoadDetailHosts(doc);
  const enabled = context.numeroColumnEnabled !== false;
  const offerTpl = context.emailOfferTemplate ?? "";
  const bookingTpl = context.emailBookingTemplate ?? "";
  const templateMode = context.emailTemplateMode ?? "default";
  const routeInspector = context.routeInspector ?? null;
  const renderExtras = {
    userAccountEmail: context.userAccountEmail ?? "",
    onRequestGoogleLogin: context.onRequestGoogleLogin ?? null
  };

  for (const host of hosts) {
    const detailHost = /** @type {HTMLElement} */ (host);

    if (!enabled) {
      teardownDetailUi(detailHost);
      continue;
    }

    const data = extractLoadDetailData(detailHost);
    if (!data.origin || !data.destination) {
      teardownDetailUi(detailHost);
      continue;
    }

    const mounted = ensureAssistMount(detailHost);
    if (!mounted) {
      continue;
    }
    const { host: shadowHost, card } = mounted;

    const searchOrigin = readSearchOriginText(doc);
    const signature = `${searchOrigin}__${data.origin}__${data.destination}__${data.rateDollars ?? "na"}`;
    if (shadowHost.dataset.signature !== signature) {
      shadowHost.dataset.signature = signature;
      shadowHost.dataset.loadingRoute = "false";
      shadowHost.__datExtRouteData = null;
      shadowHost.__datExtUserRate = null;
    }

    const requestRoute = (forceRefresh = false) => {
      if (!routeInspector || shadowHost.dataset.loadingRoute === "true") {
        return;
      }

      shadowHost.dataset.loadingRoute = "true";
      safeRender(
        shadowHost,
        card,
        data,
        shadowHost.__datExtRouteData || null,
        true,
        offerTpl,
        bookingTpl,
        templateMode,
        refreshRoute,
        renderExtras
      );

      Promise.resolve(
        inspectDispatcherM3Route(
          routeInspector,
          searchOrigin,
          data.origin,
          data.destination,
          forceRefresh ? { forceRefresh: true } : undefined
        )
      )
        .then((route) => {
          if (!shadowHost.isConnected || shadowHost.dataset.signature !== signature) {
            return;
          }
          shadowHost.__datExtRouteData = route;
          shadowHost.dataset.loadingRoute = "false";
          safeRender(shadowHost, card, data, route, false, offerTpl, bookingTpl, templateMode, refreshRoute, renderExtras);
        })
        .catch((error) => {
          if (!shadowHost.isConnected || shadowHost.dataset.signature !== signature) {
            return;
          }
          shadowHost.__datExtRouteData = {
            routeConfidence: "unavailable",
            routeSource: "Unavailable",
            routeOptionsCount: 0,
            tollStatus: "Unavailable",
            routeUrl: null,
            mapLineLatLngs: null,
            notes: [String(error?.message || "Route lookup failed")]
          };
          shadowHost.dataset.loadingRoute = "false";
          safeRender(
            shadowHost,
            card,
            data,
            shadowHost.__datExtRouteData,
            false,
            offerTpl,
            bookingTpl,
            templateMode,
            refreshRoute,
            renderExtras
          );
        });
    };
    const refreshRoute = () => requestRoute(true);

    const routeData = shadowHost.__datExtRouteData || null;
    const isLoadingRoute = shadowHost.dataset.loadingRoute === "true";
    safeRender(
      shadowHost,
      card,
      data,
      routeData,
      isLoadingRoute,
      offerTpl,
      bookingTpl,
      templateMode,
      refreshRoute,
      renderExtras
    );

    if (!routeData && !isLoadingRoute && routeInspector) {
      requestRoute(false);
    }
  }
}
