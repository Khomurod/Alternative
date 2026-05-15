import { interpolateEmailTemplate } from "./email-template.js";
import { openDatExtGmailDrawer } from "./gmail-drawer.js";
import { pickGmailComposeOrMailto } from "./gmail-compose.js";
import { destroyLaneMap, mountLaneMap } from "./numeo-map.js";
import { resolveDetailPanelRpm } from "./parsers.js";

export const TOM_ROW_CLASS = "dat-ext-tom-row";
export const TOM_COLUMN_CLASS = "dat-ext-tom-column";
export const TOM_PANEL_CLASS = "dat-ext-tom-panel";
export const TOM_ANCHOR_ATTR = "data-dat-ext-tom-anchor";
export const TOM_HOST_DATASET = "datExtTomHost";

const DEFAULT_CELL_TYPOGRAPHY = {
  fontFamily: '"Sequel Sans", Helvetica, Arial, sans-serif',
  fontSize: "12px",
  color: "#101828",
  lineHeight: "1.25"
};

/**
 * @typedef {Object} TabletRowInsertion
 * @property {"row-before"} mode
 * @property {HTMLElement} parent   - tablet container (parent of rate row)
 * @property {HTMLElement} before   - the rate `.table-details-row` to insert before
 * @property {HTMLElement} surface  - same as parent (used for cleanup scope)
 *
 * @typedef {Object} DesktopColumnInsertion
 * @property {"column-before"} mode
 * @property {HTMLElement} parent   - flex row (e.g. `.desktop-container`) that contains rate column
 * @property {HTMLElement} before   - the column element that contains the rate block
 * @property {HTMLElement} surface  - root detail container for cleanup scope
 *
 * @typedef {TabletRowInsertion | DesktopColumnInsertion} Insertion
 */

/**
 * Choose where to inject the assist surface for an expanded `dat-load-details` host.
 *
 * Supports two real DAT layouts:
 *
 *  - **tablet** (`.tablet-details-container` with stacked `.table-details-row` children):
 *    insert a new full-width row immediately before the rate row.
 *  - **desktop** (horizontal flex row of columns where one column wraps the rate block):
 *    insert a new column immediately before the rate column inside that flex row.
 *
 * @param {HTMLElement} detailHost
 * @returns {Insertion | null}
 */
export function findRateInsertion(detailHost) {
  if (!(detailHost instanceof HTMLElement)) {
    return null;
  }

  const rateEl = detailHost.querySelector('[data-test="rate-details-container"]');
  if (!(rateEl instanceof Element)) {
    return null;
  }

  // 1) Tablet layout — same-row stacking.
  const tabletContainer = detailHost.querySelector(".tablet-details-container");
  if (tabletContainer instanceof HTMLElement && tabletContainer.contains(rateEl)) {
    const rateRow = rateEl.closest(".table-details-row");
    if (rateRow instanceof HTMLElement && rateRow.parentElement === tabletContainer) {
      // If that row already has multiple `.details-column` siblings, we can place a NEW
      // column right before the one holding the rate.
      const rateColumnInRow = closestChildOf(rateEl, rateRow);
      if (rateColumnInRow && countElementChildren(rateRow) >= 2 && rateColumnInRow !== rateRow.firstElementChild) {
        return {
          mode: "column-before",
          parent: rateRow,
          before: rateColumnInRow,
          surface: tabletContainer
        };
      }
      return {
        mode: "row-before",
        parent: tabletContainer,
        before: rateRow,
        surface: tabletContainer
      };
    }
  }

  // 2) Desktop layout — flex row of columns. We assume the rate's column ancestor's
  //    parent is a horizontal flex container with at least two siblings.
  const desktopColumn =
    rateEl.closest(".desktop-column") ??
    rateEl.closest(".details-column") ??
    closestColumnLike(rateEl);
  if (desktopColumn instanceof HTMLElement) {
    const parent = desktopColumn.parentElement;
    if (parent instanceof HTMLElement && countElementChildren(parent) >= 2 && desktopColumn !== parent.firstElementChild) {
      return {
        mode: "column-before",
        parent,
        before: desktopColumn,
        surface: parent
      };
    }
  }

  return null;
}

/**
 * Back-compat alias retained for the previous tablet-only API and tests.
 *
 * @param {HTMLElement} detailHost
 * @returns {{ tabletContainer: HTMLElement, rateRow: HTMLElement } | null}
 */
export function findRateRowInsertion(detailHost) {
  const insertion = findRateInsertion(detailHost);
  if (!insertion || insertion.mode !== "row-before") {
    return null;
  }
  return { tabletContainer: insertion.parent, rateRow: insertion.before };
}

/**
 * @param {ParentNode | null | undefined} scope
 */
export function removeAllTomRows(scope) {
  if (!scope) {
    return;
  }
  for (const row of scope.querySelectorAll(`.${TOM_ROW_CLASS}`)) {
    row.remove();
  }
  for (const col of scope.querySelectorAll(`.${TOM_COLUMN_CLASS}`)) {
    col.remove();
  }
}

/**
 * Walk up from `node` until we find the element whose direct parent is `parent`.
 *
 * @param {Element} node
 * @param {Element} parent
 * @returns {HTMLElement | null}
 */
function closestChildOf(node, parent) {
  let current = node;
  while (current && current.parentElement && current.parentElement !== parent) {
    current = current.parentElement;
  }
  return current instanceof HTMLElement && current.parentElement === parent ? current : null;
}

/**
 * @param {Element} parent
 */
function countElementChildren(parent) {
  let n = 0;
  for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
    n += 1;
  }
  return n;
}

/**
 * Heuristic "column-like" ancestor of a rate cell when DAT renders without the canonical
 * column classes. We accept any ancestor whose parent has at least two element children
 * and whose tag is a block-level wrapper.
 *
 * @param {Element} node
 * @returns {HTMLElement | null}
 */
function closestColumnLike(node) {
  let current = node?.parentElement ?? null;
  let depth = 0;
  while (current instanceof HTMLElement && depth < 8) {
    const parent = current.parentElement;
    if (parent instanceof HTMLElement && countElementChildren(parent) >= 2) {
      return current;
    }
    current = parent;
    depth += 1;
  }
  return null;
}

/**
 * Match DAT `.cell-rate` / `.cell-trip` metrics from the live loadboard when available.
 *
 * @param {Document} doc
 * @returns {{ fontFamily: string, fontSize: string, color: string, lineHeight: string }}
 */
export function readDatNativeCellTypography(doc) {
  if (!doc?.querySelector) {
    return { ...DEFAULT_CELL_TYPOGRAPHY };
  }

  const ref =
    doc.querySelector(".cell-rate, [data-test='load-rate-cell']") ||
    doc.querySelector(".cell-trip, [data-test='load-trip-cell']");

  if (!(ref instanceof HTMLElement)) {
    return { ...DEFAULT_CELL_TYPOGRAPHY };
  }

  const computed = window.getComputedStyle(ref);
  return {
    fontFamily: computed.fontFamily || DEFAULT_CELL_TYPOGRAPHY.fontFamily,
    fontSize: computed.fontSize || DEFAULT_CELL_TYPOGRAPHY.fontSize,
    color: computed.color || DEFAULT_CELL_TYPOGRAPHY.color,
    lineHeight: computed.lineHeight || DEFAULT_CELL_TYPOGRAPHY.lineHeight
  };
}

/**
 * @param {{ fontFamily: string, fontSize: string, color: string, lineHeight: string }} typography
 * @param {boolean} gridCell
 */
function buildColumnStyles(typography, gridCell) {
  const cardSurface = gridCell
    ? "background: transparent; border: none; padding: 4px;"
    : "border: 1px solid #dfe3ea; border-radius: 6px; background: #ffffff; padding: 10px;";

  return `
:host {
  all: initial;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  min-width: 0;
  font-family: ${typography.fontFamily};
  font-size: ${typography.fontSize};
  color: ${typography.color};
  line-height: ${typography.lineHeight};
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${gridCell ? "6px" : "10px"};
  overflow: hidden;
  min-width: 0;
  ${cardSurface}
}

.panel-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  font-size: inherit;
  font-weight: 700;
  color: inherit;
  letter-spacing: 0;
  white-space: nowrap;
}

.actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.btn {
  height: ${gridCell ? "26px" : "30px"};
  border: 1px solid #cfd6e5;
  border-radius: 5px;
  background: #ffffff;
  color: #2d466f;
  font-size: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
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
  grid-template-columns: repeat(${gridCell ? "2" : "4"}, minmax(${gridCell ? "64px" : "76px"}, 1fr));
  gap: ${gridCell ? "4px 8px" : "8px"};
  align-items: end;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.metric--toll {
  min-width: ${gridCell ? "0" : "132px"};
}

.metric-toll-source {
  font-size: 0.85em;
  font-weight: 600;
  color: inherit;
  opacity: 0.72;
  line-height: 1.3;
  margin-top: 2px;
  padding: 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-toll-key-warning {
  font-size: 0.78em;
  font-weight: 600;
  color: #b54708;
  line-height: 1.25;
  margin-top: 4px;
  white-space: normal;
}

.metric-label {
  font-size: 0.85em;
  font-weight: 700;
  color: inherit;
  opacity: 0.72;
  letter-spacing: 0.02em;
}

.metric-input,
.metric-value {
  height: ${gridCell ? "28px" : "34px"};
  width: 100%;
  border: 1px solid ${gridCell ? "transparent" : "#d3dae7"};
  border-radius: ${gridCell ? "0" : "4px"};
  background: ${gridCell ? "transparent" : "#ffffff"};
  color: inherit;
  font-size: inherit;
  font-weight: 600;
  padding: 0 ${gridCell ? "2px" : "10px"};
  font-family: inherit;
  outline: none;
}
.metric-input:focus {
  border-color: #4e79ff;
  box-shadow: 0 0 0 2px rgba(78, 121, 255, 0.14);
}
.metric-input[readonly] {
  background: ${gridCell ? "transparent" : "#fbfcff"};
}

.metric-value {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-wrap {
  border: ${gridCell ? "none" : "1px solid #e6ebf4"};
  border-radius: ${gridCell ? "0" : "6px"};
  overflow: hidden;
  background: ${gridCell ? "transparent" : "#f8faff"};
  width: 100%;
  max-width: ${gridCell ? "100%" : "360px"};
}

.map-canvas {
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: ${gridCell ? "140px" : "220px"};
  background: #eef2f8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #60708a;
  font-size: 0.92em;
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

.dat-ext-toast-layer {
  position: fixed;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100002;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: min(92vw, 320px);
}
.dat-ext-toast {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.92em;
  font-weight: 700;
  line-height: 1.35;
  box-shadow: 0 4px 18px rgba(16, 24, 40, 0.14);
  pointer-events: auto;
}
.dat-ext-toast--success {
  background: #ecfdf3;
  color: #027a48;
  border: 1px solid #abefc6;
}
.dat-ext-toast--error {
  background: #fef3f2;
  color: #b42318;
  border: 1px solid #fecdca;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.92em;
  color: inherit;
  opacity: 0.72;
}

.sender-account {
  flex: 1 1 100%;
  min-width: 0;
}

.sender-account__label {
  font-size: 10px;
  font-weight: 600;
  color: #60708a;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 980px) {
  .actions {
    width: 100%;
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
}

/**
 * Build the shadow-root column shell (transparent grid-cell styling when embedded in DAT columns).
 *
 * @param {Document} doc
 * @param {{ gridCell?: boolean }} [options]
 * @returns {{ host: HTMLElement, shadow: ShadowRoot, card: HTMLElement }}
 */
export function createColumnDOM(doc, options = {}) {
  const { gridCell = false } = options;
  const typography = readDatNativeCellTypography(doc);

  const host = document.createElement("section");
  host.className = TOM_PANEL_CLASS;
  host.dataset[TOM_HOST_DATASET] = "1";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = buildColumnStyles(typography, gridCell);
  shadow.appendChild(style);

  const card = document.createElement("section");
  card.className = "card";
  card.setAttribute("data-role", "tom-load-intelligence");
  shadow.appendChild(card);

  return { host, shadow, card };
}

function buildTextEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (text !== undefined && text !== null) {
    el.textContent = text;
  }
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

function buildTollMetricDisplayField(label, mainValue, subtitle, dataRole, options = {}) {
  const field = document.createElement("div");
  field.className = "metric metric--toll";
  const labelEl = buildTextEl("span", "metric-label", label);
  const val = buildTextEl("div", "metric-value", mainValue);
  val.dataset.role = dataRole;
  const sub = buildTextEl("div", "metric-toll-source", subtitle);
  sub.dataset.role = "toll-source";
  field.append(labelEl, val, sub);
  if (options.showTollguruKeyWarning) {
    const warn = buildTextEl(
      "div",
      "metric-toll-key-warning",
      "⚠️ Add TollGuru Key in Extension Options."
    );
    warn.dataset.role = "tollguru-key-warning";
    field.append(warn);
  }
  return field;
}

function buildMailto(email, subject, body) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email ?? ""}?${params.toString()}`;
}

/**
 * Plain-text snapshot appended above template body inside the Gmail drawer.
 *
 * @param {*} data load detail row data
 */
function buildLoadSnapshotForEmail(data, calculatedRpm, milesForRpm, loadingRoute, rateDisplayText, tollDisplayText) {
  const rpm = formatOptionalRpm(calculatedRpm);
  const miles = formatOptionalMiles(milesForRpm, loadingRoute);
  return [
    `Origin: ${data?.origin || "—"}`,
    `Destination: ${data?.destination || "—"}`,
    `Company: ${data?.companyName || "—"}`,
    `RPM: ${rpm}`,
    `Miles: ${miles}`,
    `Rate $: ${rateDisplayText}`,
    `Toll: ${tollDisplayText}`
  ].join("\n");
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
  return text || "Unavailable";
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
  const tgHint = typeof route?.tollGuruFailureHint === "string" ? route.tollGuruFailureHint.trim() : "";
  const hintShort = tgHint.length > 100 ? `${tgHint.slice(0, 98)}…` : tgHint;

  if (src === "tollguru") {
    const v = formatTollVehicleCaption(route?.tollVehicleType);
    return v ? `TollGuru (${v})` : "TollGuru";
  }
  if (src === "google") {
    if (hintShort) {
      return `Google Routes (fallback — TollGuru: ${hintShort})`;
    }
    return "Google Routes";
  }
  if (tgHint && src === "none") {
    return hintShort ? `Toll unavailable (${hintShort})` : "Not available";
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
 * Populate the assist column card (metrics, actions, map, notes).
 *
 * @param {HTMLElement} card
 * @param {object} ctx
 */
export function renderColumn(card, ctx) {
  const {
    data,
    route,
    loadingRoute,
    offerTpl,
    bookingTpl,
    templateMode,
    shadowHost,
    onRefreshRoute,
    userAccountEmail = "",
    onRequestGoogleLogin = null,
    tollguruApiKey = ""
  } = ctx;
  card.replaceChildren();

  const senderEmail = String(userAccountEmail || "").trim();
  const gmailComposeOptions = { userAccountEmail: senderEmail };

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

  const offerSend = buildActionButton("Send Offer Email", {
    disabled: !data.contactEmail,
    dataRole: "offer-email"
  });
  if (data.contactEmail && !offerSend.disabled) {
    offerSend.addEventListener("click", () => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        window.location.href = buildMailto(data.contactEmail, offerSubject, offerBody);
        return;
      }
      const rateLabel = hasPostedRate
        ? formatMoney(data.rateDollars)
        : formatUserRateInputValue(shadowHost?.__datExtUserRate) || "—";
      const tollLine = tollMainLineDisplay(route?.tollStatus, route?.tollSource, loadingRoute);
      const snapshot = buildLoadSnapshotForEmail(data, calculatedRpm, milesForRpm, loadingRoute, rateLabel, tollLine);
      openDatExtGmailDrawer({
        mode: "offer",
        contactEmail: data.contactEmail,
        subject: offerSubject,
        body: `${snapshot}\n\n${offerBody}`.trim(),
        chips: {
          origin: data.origin,
          destination: data.destination,
          company: data.companyName,
          rpm: formatOptionalRpm(calculatedRpm),
          miles: formatOptionalMiles(milesForRpm, loadingRoute),
          rate: rateLabel,
          toll: tollLine
        },
        shadowHost: shadowHost ?? null,
        userAccountEmail: senderEmail
      });
    });
  }

  const bookingSend = buildActionButton("Send Booking Email", {
    disabled: !data.contactEmail,
    dataRole: "booking-email"
  });
  if (data.contactEmail && !bookingSend.disabled) {
    bookingSend.addEventListener("click", () => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        window.location.href = buildMailto(data.contactEmail, bookingSubject, bookingBody);
        return;
      }
      const rateLabel = hasPostedRate
        ? formatMoney(data.rateDollars)
        : formatUserRateInputValue(shadowHost?.__datExtUserRate) || "—";
      const tollLine = tollMainLineDisplay(route?.tollStatus, route?.tollSource, loadingRoute);
      const snapshot = buildLoadSnapshotForEmail(data, calculatedRpm, milesForRpm, loadingRoute, rateLabel, tollLine);
      openDatExtGmailDrawer({
        mode: "booking",
        contactEmail: data.contactEmail,
        subject: bookingSubject,
        body: `${snapshot}\n\n${bookingBody}`.trim(),
        chips: {
          origin: data.origin,
          destination: data.destination,
          company: data.companyName,
          rpm: formatOptionalRpm(calculatedRpm),
          miles: formatOptionalMiles(milesForRpm, loadingRoute),
          rate: rateLabel,
          toll: tollLine
        },
        shadowHost: shadowHost ?? null,
        userAccountEmail: senderEmail
      });
    });
  }

  actions.append(
    offerSend,
    buildActionButton("Open Offer in Gmail", {
      disabled: !data.contactEmail,
      dataRole: "offer-gmail",
      variant: "ghost",
      onClick: () => {
        const picked = pickGmailComposeOrMailto(data.contactEmail, offerSubject, offerBody, gmailComposeOptions);
        if (picked.usedGmail) {
          window.open(picked.href, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = picked.href;
        }
      }
    }),
    bookingSend,
    buildActionButton("Open Booking in Gmail", {
      disabled: !data.contactEmail,
      dataRole: "booking-gmail",
      variant: "ghost",
      onClick: () => {
        const picked = pickGmailComposeOrMailto(data.contactEmail, bookingSubject, bookingBody, gmailComposeOptions);
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
  const showTollguruKeyWarning = !String(tollguruApiKey || "").trim();
  const tollField = buildTollMetricDisplayField(
    "TOLL EST",
    tollMainLineDisplay(route?.tollStatus, route?.tollSource, loadingRoute),
    formatTollSourceSubtitle(route, loadingRoute),
    "toll",
    { showTollguruKeyWarning }
  );

  const metricsCluster = document.createElement("div");
  metricsCluster.className = "metrics-row";
  metricsCluster.append(rpmField, rateField, milesField, tollField);

  const top = document.createElement("div");
  top.className = "panel-header";

  const senderAccount = document.createElement("div");
  senderAccount.className = "sender-account";
  if (senderEmail) {
    const senderLabel = document.createElement("div");
    senderLabel.className = "sender-account__label";
    senderLabel.textContent = `Sending from: ${senderEmail}`;
    senderAccount.appendChild(senderLabel);
  } else {
    senderAccount.appendChild(
      buildActionButton("⚠️ Open Side Panel to sign in for Gmail", {
        variant: "ghost",
        dataRole: "gmail-signin",
        onClick: typeof onRequestGoogleLogin === "function" ? onRequestGoogleLogin : undefined,
        disabled: typeof onRequestGoogleLogin !== "function"
      })
    );
  }

  top.append(buildTextEl("span", "title", "Load Intelligence"), senderAccount, actions);

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
        const mr = typeof miles === "number" && Number.isFinite(miles) && miles > 0 ? miles : null;
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
  ctx.mapInstance = null;
  if (lineLatLngs && lineLatLngs.length >= 2 && !loadingRoute) {
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.1);
        if (!hit) {
          return;
        }
        obs.disconnect();
        if (shadowHost) {
          shadowHost.__datExtMapObs = null;
        }
        ctx.mapInstance = mountLaneMap(mapCanvas, lineLatLngs, {
          searchOriginLatLng: Array.isArray(route?.searchOriginLatLng) ? route.searchOriginLatLng : null,
          pickupLatLng: Array.isArray(route?.pickupMapLatLng) ? route.pickupMapLatLng : null,
          deliveryLatLng: Array.isArray(route?.deliveryMapLatLng) ? route.deliveryMapLatLng : null
        });
        if (shadowHost && ctx.mapInstance) {
          shadowHost.__datExtMap = ctx.mapInstance;
        }
      },
      { threshold: [0, 0.1, 0.25], rootMargin: "0px 0px 120px 0px" }
    );
    if (shadowHost) {
      shadowHost.__datExtMapObs = obs;
    }
    obs.observe(mapCanvas);
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

/**
 * @param {"row-before" | "column-before"} mode
 * @param {Document} doc
 */
export function buildAssistRowWrapper(mode, doc = document) {
  if (mode === "column-before") {
    const column = document.createElement("div");
    column.className = `details-column ${TOM_COLUMN_CLASS} dat-ext-injected`;
    column.style.display = "flex";
    column.style.flexDirection = "column";
    column.style.justifyContent = "center";
    column.style.flex = "1 1 0";
    column.style.minWidth = "0";

    const { host } = createColumnDOM(doc, { gridCell: true });
    column.appendChild(host);
    return { wrapper: column, host };
  }

  const row = document.createElement("div");
  row.className = `table-details-row row-spacing ${TOM_ROW_CLASS} dat-ext-injected`;

  const column = document.createElement("div");
  column.className = `details-column ${TOM_COLUMN_CLASS}`;
  row.appendChild(column);

  const { host } = createColumnDOM(doc, { gridCell: false });
  column.appendChild(host);
  return { wrapper: row, host };
}
