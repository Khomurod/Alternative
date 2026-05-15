import {
  extractEmail,
  parseCsDtpCell,
  parseRateCell,
  parseTripCell,
  resolveDetailPanelRpm,
  sanitizeLocationText
} from "./parsers.js";
import { interpolateEmailTemplate } from "./email-template.js";
import { pickGmailComposeOrMailto } from "./gmail-compose.js";
import { destroyLaneMap, mountLaneMap } from "./numeo-map.js";
import { inspectDispatcherM3Route } from "./routing.js";
import {
  findRateInsertion,
  removeAllTomRows,
  TOM_COLUMN_CLASS,
  TOM_PANEL_CLASS,
  TOM_ROW_CLASS
} from "./numeo-column.js";

const TOM_HOST_DATASET = "datExtTomHost";

const SHADOW_STYLES = `
:host {
  all: initial;
  display: block;
  width: 100%;
  font-family: "Sequel Sans", Helvetica, Arial, sans-serif;
  color: #101828;
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  width: 100%;
  border: 1px solid #dfe3ea;
  border-radius: 6px;
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-size: 12px;
  font-weight: 700;
  color: #1d2939;
  letter-spacing: 0;
  white-space: nowrap;
}

.actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
}

.btn {
  height: 30px;
  border: 1px solid #cfd6e5;
  border-radius: 5px;
  background: #ffffff;
  color: #2d466f;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  font-family: inherit;
  white-space: nowrap;
}
.btn:hover:not([disabled]):not([aria-disabled="true"]) {
  background: #f3f7ff;
}
.btn--ghost {
  border-style: dashed;
  font-weight: 600;
  color: #3d5a80;
}
.btn[disabled],
.btn[aria-disabled="true"] {
  background: #f5f7fb;
  border-color: #dfe4ee;
  color: #8a97ad;
  cursor: not-allowed;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(76px, 1fr));
  gap: 8px;
  align-items: end;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.metric--toll {
  min-width: 132px;
}

.metric-toll-source {
  font-size: 10px;
  font-weight: 600;
  color: #7a8799;
  line-height: 1.3;
  margin-top: 2px;
  padding: 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-label {
  font-size: 10px;
  font-weight: 700;
  color: #5a6880;
  letter-spacing: 0.02em;
}

.metric-input {
  height: 34px;
  width: 100%;
  border: 1px solid #d3dae7;
  border-radius: 4px;
  background: #ffffff;
  color: #17253a;
  font-size: 13px;
  font-weight: 600;
  padding: 0 10px;
  font-family: inherit;
  outline: none;
}
.metric-input:focus {
  border-color: #4e79ff;
  box-shadow: 0 0 0 2px rgba(78, 121, 255, 0.14);
}
.metric-input[readonly] {
  background: #fbfcff;
  color: #283a57;
}

.metric-value {
  height: 34px;
  width: 100%;
  border: 1px solid #d3dae7;
  border-radius: 4px;
  background: #fbfcff;
  color: #253857;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-wrap {
  border: 1px solid #e6ebf4;
  border-radius: 6px;
  overflow: hidden;
  background: #f8faff;
  width: 100%;
  max-width: 360px;
}

.map-canvas {
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: 220px;
  background: #eef2f8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #60708a;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  padding: 8px;
}

.map-canvas :is(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #5a6880;
}

@media (max-width: 980px) {
  .actions {
    width: 100%;
    flex-wrap: wrap;
  }
  .map-wrap {
    max-width: 100%;
  }
}

@media (max-width: 560px) {
  .metrics-row {
    grid-template-columns: repeat(2, minmax(92px, 1fr));
  }
  .metric--toll {
    grid-column: 1 / -1;
  }
}
`;

function visibleText(element) {
  return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
}

function looksLikeCompanyName(text) {
  return /\b(logistics|freight|transport|trucking|solutions|broker|sales|carrier|shipping|express|inc|llc|corp|co)\b/i.test(
    text
  );
}

function formatMoney(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("en-US")}` : "0";
}

function formatRpm(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatOptionalRpm(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "--";
}

function formatOptionalMiles(value, loadingRoute) {
  if (loadingRoute) {
    return "...";
  }
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return "--";
  }
  return `${Math.round(value).toLocaleString("en-US")}`;
}

function formatTollStatus(value, loadingRoute) {
  if (loadingRoute) {
    return "Loading...";
  }
  const text = String(value || "").trim();
  if (!text) {
    return "Unavailable";
  }
  return text;
}

function formatTollVehicleCaption(vehicleType) {
  if (typeof vehicleType !== "string" || !vehicleType.trim()) {
    return "";
  }
  const t = vehicleType.trim();
  if (t === "5AxlesTruck") {
    return "5-axle truck";
  }
  return t
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function formatTollSourceSubtitle(route, loadingRoute) {
  if (loadingRoute) {
    return "Loading...";
  }
  const src = route?.tollSource;
  if (src === "tollguru") {
    const v = formatTollVehicleCaption(route?.tollVehicleType);
    return v ? `TollGuru (${v})` : "TollGuru";
  }
  if (src === "google") {
    return "Google Routes";
  }
  return "Not available";
}

function tollMainLineDisplay(tollStatus, tollSource, loadingRoute) {
  const text = formatTollStatus(tollStatus, loadingRoute);
  if (loadingRoute || tollSource !== "tollguru") {
    return text;
  }
  const suffix = " (TollGuru)";
  if (text.endsWith(suffix)) {
    const stripped = text.slice(0, -suffix.length).trim();
    return stripped || text;
  }
  return text;
}

function formatUserRateInputValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }
  return String(value);
}

/**
 * Reads the active One Search origin field (not the load pickup). Used for deadhead to first stop.
 * @param {Document} doc
 * @returns {string}
 */
export function readSearchOriginText(doc) {
  if (!doc?.querySelector) {
    return "";
  }
  const root = doc.body || doc;
  const selectors = [
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

function buildMailto(email, subject, body) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email ?? ""}?${params.toString()}`;
}

function defaultOfferBody(data) {
  return `Hello ${data.companyName || ""},\n\nI am reaching out regarding the load from ${data.origin || "Origin"} to ${
    data.destination || "Destination"
  }. Is this still available?\n\nThank you.`;
}

function defaultBookingBody(data) {
  return `Hello ${data.companyName || ""},\n\nI would like to discuss booking the load from ${data.origin || "Origin"} to ${
    data.destination || "Destination"
  }.\n\nThank you.`;
}

function buildShadowTree(shadow) {
  shadow.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = SHADOW_STYLES;
  shadow.appendChild(style);

  const card = document.createElement("section");
  card.className = "card";
  card.setAttribute("data-role", "tom-load-intelligence");
  shadow.appendChild(card);
  return card;
}

function buildTextEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function buildActionButton(label, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = label;
  if (options.variant === "ghost") {
    button.classList.add("btn--ghost");
  }
  if (options.disabled) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  } else if (typeof options.onClick === "function") {
    button.addEventListener("click", options.onClick);
  }
  if (options.dataRole) {
    button.dataset.role = options.dataRole;
  }
  return button;
}

function buildMetricField(label, value, dataRole, options = {}) {
  const { readOnly = true } = options;
  const field = document.createElement("label");
  field.className = "metric";
  const labelEl = buildTextEl("span", "metric-label", label);
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.readOnly = readOnly;
  input.className = "metric-input";
  input.dataset.role = dataRole;
  field.append(labelEl, input);
  return field;
}

function buildTollMetricDisplayField(label, mainValue, subtitle, dataRole) {
  const field = document.createElement("div");
  field.className = "metric metric--toll";
  const labelEl = buildTextEl("span", "metric-label", label);
  const val = buildTextEl("div", "metric-value", mainValue);
  val.dataset.role = dataRole;
  const sub = buildTextEl("div", "metric-toll-source", subtitle);
  sub.dataset.role = "toll-source";
  field.append(labelEl, val, sub);
  return field;
}

function renderShadowCard(card, ctx) {
  const { data, route, loadingRoute, offerTpl, bookingTpl, templateMode, shadowHost, onRefreshRoute } = ctx;
  card.replaceChildren();

  const roadMiles =
    !loadingRoute &&
    route?.adjustedMiles !== null &&
    route?.adjustedMiles !== undefined &&
    Number.isFinite(route.adjustedMiles) &&
    route.adjustedMiles > 0
      ? route.adjustedMiles
      : null;
  const datTripMiles =
    data.tripMiles !== null && data.tripMiles !== undefined && Number.isFinite(data.tripMiles) && data.tripMiles > 0
      ? data.tripMiles
      : null;
  const milesForRpm = roadMiles ?? datTripMiles;

  const hasPostedRate = data.rateDollars !== null && data.rateDollars > 0;
  let effectiveRate = null;
  if (hasPostedRate) {
    effectiveRate = data.rateDollars;
  } else if (shadowHost) {
    const ur = shadowHost.__datExtUserRate;
    if (typeof ur === "number" && Number.isFinite(ur) && ur > 0) {
      effectiveRate = ur;
    }
  }

  const calculatedRpm = resolveDetailPanelRpm(effectiveRate, datTripMiles, roadMiles, data.rpmHint ?? null);

  const offerSubject = `Offer for Load: ${data.origin || "Origin"} to ${data.destination || "Destination"}`;
  const bookingSubject = `Booking Request: ${data.origin || "Origin"} to ${data.destination || "Destination"}`;
  const vars = {
    origin: data.origin || "Origin",
    destination: data.destination || "Destination",
    companyName: data.companyName || "",
    contactEmail: data.contactEmail || ""
  };
  const offerBodyBase = interpolateEmailTemplate(offerTpl, vars) ?? defaultOfferBody(data);
  const bookingBodyBase = interpolateEmailTemplate(bookingTpl, vars) ?? defaultBookingBody(data);
  const offerBody = templateMode === "booking" ? bookingBodyBase : offerBodyBase;
  const bookingBody = templateMode === "offer" ? offerBodyBase : bookingBodyBase;

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    buildActionButton("Send Offer Email", {
      disabled: !data.contactEmail,
      dataRole: "offer-email",
      onClick: () => {
        window.location.href = buildMailto(data.contactEmail, offerSubject, offerBody);
      }
    }),
    buildActionButton("Open Offer in Gmail", {
      disabled: !data.contactEmail,
      dataRole: "offer-gmail",
      variant: "ghost",
      onClick: () => {
        const picked = pickGmailComposeOrMailto(data.contactEmail, offerSubject, offerBody);
        if (picked.usedGmail) {
          window.open(picked.href, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = picked.href;
        }
      }
    }),
    buildActionButton("Send Booking Email", {
      disabled: !data.contactEmail,
      dataRole: "booking-email",
      onClick: () => {
        window.location.href = buildMailto(data.contactEmail, bookingSubject, bookingBody);
      }
    }),
    buildActionButton("Open Booking in Gmail", {
      disabled: !data.contactEmail,
      dataRole: "booking-gmail",
      variant: "ghost",
      onClick: () => {
        const picked = pickGmailComposeOrMailto(data.contactEmail, bookingSubject, bookingBody);
        if (picked.usedGmail) {
          window.open(picked.href, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = picked.href;
        }
      }
    }),
    buildActionButton("Get Tolls", {
      disabled: typeof onRefreshRoute !== "function" || loadingRoute,
      dataRole: "get-tolls",
      onClick: () => {
        if (typeof onRefreshRoute === "function") {
          onRefreshRoute();
        }
      }
    })
  );

  const rpmField = buildMetricField("RPM $", formatOptionalRpm(calculatedRpm), "rpm");
  const rateDisplay = hasPostedRate ? formatMoney(data.rateDollars) : formatUserRateInputValue(shadowHost?.__datExtUserRate);
  const rateField = buildMetricField("RATE $", rateDisplay, "rate", { readOnly: hasPostedRate });
  const milesField = buildMetricField("MILES", formatOptionalMiles(milesForRpm, loadingRoute), "miles");
  const tollField = buildTollMetricDisplayField(
    "TOLL EST",
    tollMainLineDisplay(route?.tollStatus, route?.tollSource, loadingRoute),
    formatTollSourceSubtitle(route, loadingRoute),
    "toll"
  );

  const metricsCluster = document.createElement("div");
  metricsCluster.className = "metrics-row";
  metricsCluster.append(rpmField, rateField, milesField, tollField);

  const top = document.createElement("div");
  top.className = "panel-header";
  top.append(buildTextEl("span", "title", "Load Intelligence"), actions);

  card.append(top, metricsCluster);

  if (!hasPostedRate && shadowHost) {
    const rateInput = rateField.querySelector("input");
    if (rateInput instanceof HTMLInputElement) {
      rateInput.placeholder = "Total $";
      rateInput.addEventListener("input", () => {
        const raw = rateInput.value.replace(/,/g, "").trim();
        const num = Number.parseFloat(raw);
        shadowHost.__datExtUserRate = Number.isFinite(num) && num > 0 ? num : null;
        const miles = shadowHost.__datExtRouteData?.adjustedMiles ?? data.tripMiles;
        const mr =
          typeof miles === "number" && Number.isFinite(miles) && miles > 0 ? miles : null;
        const eff = shadowHost.__datExtUserRate;
        const rpmInput = metricsCluster.querySelector('[data-role="rpm"]');
        if (rpmInput instanceof HTMLInputElement) {
          rpmInput.value = mr && eff ? formatRpm(eff / mr) : "--";
        }
      });
    }
  }

  const mapWrap = document.createElement("div");
  mapWrap.className = "map-wrap";
  const mapCanvas = document.createElement("div");
  mapCanvas.className = "map-canvas";
  mapCanvas.dataset.role = "lane-map";
  mapWrap.appendChild(mapCanvas);
  card.appendChild(mapWrap);

  const lineLatLngs = Array.isArray(route?.mapLineLatLngs) ? route.mapLineLatLngs : null;
  if (lineLatLngs && lineLatLngs.length >= 2) {
    ctx.mapInstance = mountLaneMap(mapCanvas, lineLatLngs, {
      pickupLatLng: Array.isArray(route?.pickupMapLatLng) ? route.pickupMapLatLng : null,
      deliveryLatLng: Array.isArray(route?.deliveryMapLatLng) ? route.deliveryMapLatLng : null
    });
  } else {
    ctx.mapInstance = null;
  }
  if (!ctx.mapInstance) {
    mapCanvas.textContent = loadingRoute ? "Loading route map..." : "Route map unavailable";
  }

  const notes = document.createElement("div");
  notes.className = "notes";
  const routeSource = String(route?.routeSource || (loadingRoute ? "Loading route..." : "Unavailable"));
  notes.appendChild(buildTextEl("div", "", `Route source: ${routeSource}`));
  if (route?.routeConfidence) {
    notes.appendChild(buildTextEl("div", "", `Confidence: ${String(route.routeConfidence)}`));
  }
  const firstNote = Array.isArray(route?.notes) ? route.notes[0] : "";
  if (firstNote) {
    notes.appendChild(buildTextEl("div", "", String(firstNote)));
  }
  card.appendChild(notes);
}

function buildAssistRowWrapper(mode) {
  if (mode === "column-before") {
    const column = document.createElement("div");
    column.className = `details-column ${TOM_COLUMN_CLASS} dat-ext-injected`;
    column.style.flex = "1 1 0";
    column.style.minWidth = "min(100%, 360px)";

    const host = document.createElement("section");
    host.className = TOM_PANEL_CLASS;
    host.dataset[TOM_HOST_DATASET] = "1";
    host.attachShadow({ mode: "open" });
    buildShadowTree(host.shadowRoot);
    column.appendChild(host);
    return { wrapper: column, host };
  }

  const row = document.createElement("div");
  row.className = `table-details-row row-spacing ${TOM_ROW_CLASS} dat-ext-injected`;

  const column = document.createElement("div");
  column.className = `details-column ${TOM_COLUMN_CLASS}`;
  row.appendChild(column);

  const host = document.createElement("section");
  host.className = TOM_PANEL_CLASS;
  host.dataset[TOM_HOST_DATASET] = "1";
  host.attachShadow({ mode: "open" });
  buildShadowTree(host.shadowRoot);
  column.appendChild(host);
  return { wrapper: row, host };
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
    const { wrapper } = buildAssistRowWrapper(mode);
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

function safeRender(host, card, data, route, loadingRoute, offerTpl, bookingTpl, templateMode, onRefreshRoute) {
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
    mapInstance: null
  };
  renderShadowCard(card, ctx);
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
        refreshRoute
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
          safeRender(shadowHost, card, data, route, false, offerTpl, bookingTpl, templateMode, refreshRoute);
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
            refreshRoute
          );
        });
    };
    const refreshRoute = () => requestRoute(true);

    const routeData = shadowHost.__datExtRouteData || null;
    const isLoadingRoute = shadowHost.dataset.loadingRoute === "true";
    safeRender(shadowHost, card, data, routeData, isLoadingRoute, offerTpl, bookingTpl, templateMode, refreshRoute);

    if (!routeData && !isLoadingRoute && routeInspector) {
      requestRoute(false);
    }
  }
}
