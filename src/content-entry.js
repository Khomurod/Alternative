import { configureDatExtGmailDrawer } from "./gmail-drawer.js";
import { enhanceLoadDetails } from "./detail-panel.js";
import { buildGoogleDirectionsUrlForPin, buildGoogleDirectionsUrlForRow } from "./directions-from-row.js";
import { EMAIL_BOOKING_TEMPLATE_KEY, EMAIL_OFFER_TEMPLATE_KEY } from "./email-template.js";
import { DAT_EXT_NUMEO_COLUMN_KEY, defaultNumeoColumnEnabled } from "./feature-flags.js";
import { DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY, defaultEmailIncludeSnapshotEnabled } from "./email-settings.js";
import { DAT_EXT_USER_ACCOUNT_EMAIL_KEY } from "./google-account.js";
import {
  DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY,
  DAT_EXT_TOLLGURU_API_KEY,
  DAT_EXT_TOLLGURU_SKIP_POLYLINE_MAP_KEY,
  defaultGoogleTollFallbackAllowed,
  getEffectiveTollGuruApiKey,
  tollguruKeyFingerprint
} from "./tollguru-api-key.js";
import { queryDeepAll } from "./dom-deep.js";
import { findDatOneViewport } from "./dat-one-virtual.js";
import { findResultsGrid, scanDocumentForGrids } from "./grid.js";
import { resolveScanScopeFromMutations, shouldScheduleScanFromMutations } from "./mutation-gating.js";
import {
  injectLoadDetailDirectionAnchors,
  injectRowSummaryDirectionAnchors,
  ROW_DIR_ATTR,
  ROW_DIR_CONTEXT_ATTR
} from "./row-summary-directions.js";
import { createRouteInspector } from "./routing.js";

const HEADER_TOOLS_ID = "my-ext-compact-tools";
const ROOT_CLASS = "dat-ext-root";
const INJECTED_FLAG = "dat-ext-injected";
const PREFS_KEY = "dat-ext-user-prefs-v3";
const EMAIL_STATE_KEY = "dat-ext-email-ui-state-v1";

const DEFAULT_PREFS = {
  minRate: "",
  minRpm: "",
  maxMiles: "",
  maxWeight: ""
};

const state = {
  observer: null,
  debounceTimer: null,
  summaryEl: null,
  statsEl: null,
  ignoredEl: null,
  applyEl: null,
  emailSelectEl: null,
  templateSelectEl: null,
  connectEl: null,
  routeIconListenerAttached: false,
  rowDirListenerAttached: false,
  inputsRoot: null,
  inputsSyncHandler: null,
  routeInspector: null,
  tollguruApiKey: getEffectiveTollGuruApiKey(""),
  googleTollFallbackAllowed: defaultGoogleTollFallbackAllowed(),
  tollguruSkipPolylineForCurrentKey: false,
  emailOfferTemplate: "",
  emailBookingTemplate: "",
  emailIncludeSnapshot: defaultEmailIncludeSnapshotEnabled(),
  numeroColumnEnabled: true,
  appliedTargets: {
    minRate: null,
    minRpm: null,
    maxMiles: null,
    maxWeight: null,
    onlyMatches: false
  },
  pendingScanScope: null,
  cachedViewport: null,
  emailUiState: {
    selectedEmail: "",
    selectedTemplate: "default"
  },
  userAccountEmail: ""
};

bootstrap();

function bootstrap() {
  if (window.__datDispatcherAssistInitialized) {
    return;
  }

  window.__datDispatcherAssistInitialized = true;
  configureDatExtGmailDrawer({ onRequestGoogleLogin: requestOpenSidePanel });
  rebuildRouteInspector();
  loadNumeoColumnPreference();
  loadRouteEconomicsPreferencesFromChrome();
  loadUserAccountEmailFromStorage();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }

  start();
}

function start() {
  state.appliedTargets = parseTargetsFromPrefs(readStoredPrefs());
  loadEmailUiStateFromStorage();
  attachEmailTemplateListener();
  attachNumeoColumnPreferenceListener();
  attachRouteEconomicsChromeListener();
  attachUserAccountEmailListener();
  attachRouteIconDirectionsListener();
  attachRowSummaryDirectionsListener();

  loadEmailTemplatesFromStorage(() => {
    startObserver();
    scheduleScan(true);

    if (!String(state.userAccountEmail || "").trim()) {
      maybeSilentGoogleSessionSync();
    }
  });
}

function applyTollguruSkipPolylineFromRecord(record) {
  const key = String(state.tollguruApiKey || "").trim();
  if (!key) {
    state.tollguruSkipPolylineForCurrentKey = false;
    return;
  }
  const fp = tollguruKeyFingerprint(key);
  const raw = record[DAT_EXT_TOLLGURU_SKIP_POLYLINE_MAP_KEY];
  const map = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  state.tollguruSkipPolylineForCurrentKey = Boolean(map[fp]);
}

function rebuildRouteInspector() {
  state.routeInspector = createRouteInspector({
    tollguruApiKey: state.tollguruApiKey,
    googleTollFallbackAllowed: state.googleTollFallbackAllowed,
    tollguruSkipPolylineForCurrentKey: state.tollguruSkipPolylineForCurrentKey
  });
  const keyLen = typeof state.tollguruApiKey === "string" ? state.tollguruApiKey.length : 0;
  if (keyLen === 0) {
    console.warn(
      "[TollGuru Debug] No TollGuru API key configured; truck toll lookups are skipped. Add one in the extension popup."
    );
  }
}

function hydrateRouteEconomicsFromChromeRecord(record) {
  state.tollguruApiKey = getEffectiveTollGuruApiKey(record[DAT_EXT_TOLLGURU_API_KEY]);
  state.googleTollFallbackAllowed = record[DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY] !== false;
  applyTollguruSkipPolylineFromRecord(record ?? {});
}

function loadRouteEconomicsPreferencesFromChrome() {
  if (!globalThis.chrome?.storage?.local?.get) {
    return;
  }

  chrome.storage.local.get(
    [
      DAT_EXT_TOLLGURU_API_KEY,
      DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY,
      DAT_EXT_TOLLGURU_SKIP_POLYLINE_MAP_KEY
    ],
    (result) => {
      hydrateRouteEconomicsFromChromeRecord(result ?? {});
      rebuildRouteInspector();
      scheduleScan(true);
    }
  );
}

function attachRouteEconomicsChromeListener() {
  if (!globalThis.chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (
      !changes[DAT_EXT_TOLLGURU_API_KEY] &&
      !changes[DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY] &&
      !changes[DAT_EXT_TOLLGURU_SKIP_POLYLINE_MAP_KEY]
    ) {
      return;
    }

    chrome.storage.local.get(
      [
        DAT_EXT_TOLLGURU_API_KEY,
        DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY,
        DAT_EXT_TOLLGURU_SKIP_POLYLINE_MAP_KEY
      ],
      (fresh) => {
        hydrateRouteEconomicsFromChromeRecord(fresh ?? {});
        rebuildRouteInspector();
        scheduleScan(true);
      }
    );
  });
}

function loadNumeoColumnPreference() {
  if (!globalThis.chrome?.storage?.local?.get) {
    state.numeroColumnEnabled = defaultNumeoColumnEnabled();
    return;
  }

  chrome.storage.local.get([DAT_EXT_NUMEO_COLUMN_KEY], (result) => {
    const raw = result[DAT_EXT_NUMEO_COLUMN_KEY];
    state.numeroColumnEnabled = raw !== false;
    scheduleScan(true);
  });
}

function attachNumeoColumnPreferenceListener() {
  if (!globalThis.chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[DAT_EXT_NUMEO_COLUMN_KEY]) {
      return;
    }

    state.numeroColumnEnabled = changes[DAT_EXT_NUMEO_COLUMN_KEY].newValue !== false;
    scheduleScan(true);
  });
}

/**
 * @param {() => void} [onReady]
 */
function loadEmailTemplatesFromStorage(onReady) {
  if (!globalThis.chrome?.storage?.local?.get) {
    onReady?.();
    return;
  }

  chrome.storage.local.get([EMAIL_OFFER_TEMPLATE_KEY, EMAIL_BOOKING_TEMPLATE_KEY, DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY], (r) => {
    state.emailOfferTemplate = r[EMAIL_OFFER_TEMPLATE_KEY] ?? "";
    state.emailBookingTemplate = r[EMAIL_BOOKING_TEMPLATE_KEY] ?? "";
    state.emailIncludeSnapshot = r[DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY] === true;
    onReady?.();
  });
}

function loadEmailUiStateFromStorage() {
  try {
    const raw = window.localStorage.getItem(EMAIL_STATE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    state.emailUiState = {
      selectedEmail: String(parsed?.selectedEmail || ""),
      selectedTemplate:
        parsed?.selectedTemplate === "offer" || parsed?.selectedTemplate === "booking" ? parsed.selectedTemplate : "default"
    };
  } catch {
    state.emailUiState = {
      selectedEmail: "",
      selectedTemplate: "default"
    };
  }
}

function persistEmailUiState(nextState) {
  state.emailUiState = {
    selectedEmail: String(nextState?.selectedEmail || ""),
    selectedTemplate:
      nextState?.selectedTemplate === "offer" || nextState?.selectedTemplate === "booking"
        ? nextState.selectedTemplate
        : "default"
  };

  try {
    window.localStorage.setItem(EMAIL_STATE_KEY, JSON.stringify(state.emailUiState));
  } catch {
    /* Ignore storage failures */
  }
}

function attachEmailTemplateListener() {
  if (!globalThis.chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }

    if (
      !changes[EMAIL_OFFER_TEMPLATE_KEY] &&
      !changes[EMAIL_BOOKING_TEMPLATE_KEY] &&
      !changes[DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY]
    ) {
      return;
    }

    if (changes[EMAIL_OFFER_TEMPLATE_KEY]) {
      state.emailOfferTemplate = changes[EMAIL_OFFER_TEMPLATE_KEY].newValue ?? "";
    }
    if (changes[EMAIL_BOOKING_TEMPLATE_KEY]) {
      state.emailBookingTemplate = changes[EMAIL_BOOKING_TEMPLATE_KEY].newValue ?? "";
    }

    if (changes[DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY]) {
      state.emailIncludeSnapshot = changes[DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY].newValue === true;
    }

    scheduleScan(true);
  });
}

function startObserver() {
  if (!document.body || state.observer) {
    return;
  }

  state.observer = new MutationObserver((mutations) => {
    if (
      !shouldScheduleScanFromMutations(mutations, {
        injectedFlag: INJECTED_FLAG,
        rootClass: ROOT_CLASS
      })
    ) {
      return;
    }

    const scope = resolveScanScopeFromMutations(mutations);
    if (scope) {
      state.pendingScanScope = scope;
    }

    scheduleScan(false);
  });

  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-expanded", "aria-selected", "aria-busy"]
  });

  window.addEventListener("hashchange", () => scheduleScan(true), { passive: true });
  window.addEventListener("popstate", () => scheduleScan(true), { passive: true });
  window.addEventListener("resize", () => scheduleScan(false), { passive: true });
}

function scheduleScan(immediate) {
  window.clearTimeout(state.debounceTimer);

  const flushPendingScanScope = () => {
    const scope = state.pendingScanScope;
    state.pendingScanScope = null;
    return scope;
  };

  const performDomInjection = (allowDocumentDeepScan, scanScope) => {
    try {
      if (state.cachedViewport && !state.cachedViewport.isConnected) {
        state.cachedViewport = null;
      }

      const allowFullDocumentScan = allowDocumentDeepScan || state.cachedViewport === null;
      const targets = state.appliedTargets;
      const scanOptions = {
        onlyMatches: false,
        scanScope,
        allowDocumentDeepScan: allowFullDocumentScan,
        cachedViewport: state.cachedViewport
      };

      injectHeaderTools();

      if (!state.cachedViewport) {
        state.cachedViewport = findDatOneViewport(document, {
          scope: scanScope,
          allowDocumentDeepScan: allowFullDocumentScan
        });
      }

      const result = scanDocumentForGrids(document, targets, {
        ...scanOptions,
        cachedViewport: state.cachedViewport
      });

      updateSummary(result, targets);
      enhanceLoadDetails(document, {
        targets,
        result,
        routeInspector: state.routeInspector,
        emailOfferTemplate: state.emailOfferTemplate,
        emailBookingTemplate: state.emailBookingTemplate,
        emailIncludeSnapshot: state.emailIncludeSnapshot,
        emailTemplateMode: state.emailUiState.selectedTemplate,
        numeroColumnEnabled: state.numeroColumnEnabled,
        userAccountEmail: state.userAccountEmail,
        onRequestGoogleLogin: requestOpenSidePanel,
        tollguruApiKey: state.tollguruApiKey
      });

      injectRowSummaryDirectionAnchors(document);
      injectLoadDetailDirectionAnchors(document);

      if (window.__DAT_ASSIST_DEBUG && result.rowCount === 0) {
        const debugRoot =
          scanScope instanceof HTMLElement
            ? scanScope
            : state.cachedViewport instanceof HTMLElement
            ? state.cachedViewport
            : document.body;
        console.info("[DAT Dispatcher Assist] diagnostics", {
          deepTables: debugRoot ? queryDeepAll(debugRoot, "table").length : 0,
          deepGrids: debugRoot ? queryDeepAll(debugRoot, '[role="grid"]').length : 0,
          treeGrids: debugRoot ? queryDeepAll(debugRoot, '[role="treegrid"]').length : 0,
          host: window.location.href
        });
      }
    } catch (error) {
      console.warn("[DAT Dispatcher Assist] Scan failed:", error);
    }
  };

  const queueDomInjectionFrame = (allowDocumentDeepScan, scanScope) => {
    window.requestAnimationFrame(() => performDomInjection(allowDocumentDeepScan, scanScope));
  };

  if (immediate) {
    queueDomInjectionFrame(true, flushPendingScanScope());
    return;
  }

  state.debounceTimer = window.setTimeout(() => {
    queueDomInjectionFrame(false, flushPendingScanScope());
  }, 160);
}

function readStoredPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS };
    }

    const parsed = JSON.parse(raw);
    return {
      minRate: String(parsed?.minRate ?? DEFAULT_PREFS.minRate),
      minRpm: String(parsed?.minRpm ?? DEFAULT_PREFS.minRpm),
      maxMiles: String(parsed?.maxMiles ?? DEFAULT_PREFS.maxMiles),
      maxWeight: String(parsed?.maxWeight ?? DEFAULT_PREFS.maxWeight)
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function persistPrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Ignore private-mode/storage quota failures */
  }
}

function parseTargetsFromPrefs(prefs) {
  const toNumberOrNull = (raw) => {
    const value = parseFloat(String(raw ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) ? value : null;
  };

  return {
    minRate: toNumberOrNull(prefs?.minRate),
    minRpm: toNumberOrNull(prefs?.minRpm),
    maxMiles: toNumberOrNull(prefs?.maxMiles),
    maxWeight: toNumberOrNull(prefs?.maxWeight),
    onlyMatches: false
  };
}

function readDraftPrefs(root) {
  const pick = (field) => String(root.querySelector(`[data-field="${field}"]`)?.value ?? "");
  return {
    minRate: pick("target-rate"),
    minRpm: pick("target-rpm"),
    maxMiles: pick("target-miles"),
    maxWeight: pick("target-weight")
  };
}

function applyDraftTargets(root) {
  const prefs = readDraftPrefs(root);
  persistPrefs(prefs);
  state.appliedTargets = parseTargetsFromPrefs(prefs);
  scheduleScan(true);
}

function syncCompactEmailOptions(root) {
  const select = root.querySelector('[data-field="email-select"]');
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }

  const account = String(state.userAccountEmail || "").trim();

  select.replaceChildren();

  if (account) {
    select.disabled = false;
    const option = document.createElement("option");
    option.value = account;
    option.textContent = account;
    select.appendChild(option);

    const stored = String(state.emailUiState.selectedEmail || "").trim();
    if (stored !== account) {
      persistEmailUiState({ ...state.emailUiState, selectedEmail: account });
    }
    select.value = account;
  } else {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Sign in required";
    placeholder.disabled = true;
    select.appendChild(placeholder);
    select.value = "";
    select.disabled = true;
  }
}

function injectHeaderTools() {
  const staleShell = document.getElementById("my-ext-assist-shell");
  if (staleShell) {
    staleShell.remove();
  }
  const staleGlobalTools = document.getElementById("my-ext-global-tools");
  if (staleGlobalTools) {
    staleGlobalTools.remove();
  }

  const mountHost = findAssistMountTarget();
  if (!mountHost) {
    return;
  }

  let panel = document.getElementById(HEADER_TOOLS_ID);
  if (!panel) {
    panel = buildHeaderTools(readStoredPrefs());
    syncNativeHeaderStyles(mountHost, panel);
  }

  if (isSearchFiltersHost(mountHost)) {
    const parent = mountHost.parentElement;
    if (parent) {
      parent.insertBefore(panel, mountHost.nextSibling);
    }
  } else if (isSearchControlsHost(mountHost)) {
    if (mountHost.firstChild !== panel) {
      mountHost.insertBefore(panel, mountHost.firstChild);
    }
  } else if (!panel.parentElement) {
    mountHost.appendChild(panel);
  } else if (panel.parentElement !== mountHost) {
    mountHost.appendChild(panel);
  }

  mountHost.classList.add(INJECTED_FLAG);
  state.summaryEl = panel.querySelector('[data-role="status"]');
  state.statsEl = null;
  state.ignoredEl = panel.querySelector('[data-role="ignored"]');
  state.applyEl = panel.querySelector('[data-action="apply"]');
  state.connectEl = panel.querySelector('[data-action="connect-email"]');
  state.emailSelectEl = panel.querySelector('[data-field="email-select"]');
  state.templateSelectEl = panel.querySelector('[data-field="template-select"]');

  syncCompactEmailOptions(panel);
  syncConnectEmailButton(panel);
  bindInputsIfNeeded();
  refreshApplyButtonState(panel);
}

function applyConnectedGoogleAccount(email) {
  state.userAccountEmail = String(email || "").trim();
  syncConnectEmailButton();
  if (!state.emailUiState.selectedEmail) {
    persistEmailUiState({
      ...state.emailUiState,
      selectedEmail: state.userAccountEmail
    });
  }
  const toolsRoot = document.getElementById(HEADER_TOOLS_ID);
  if (toolsRoot) {
    syncCompactEmailOptions(toolsRoot);
  }
  scheduleScan(true);
}

function maybeSilentGoogleSessionSync() {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return;
  }

  chrome.runtime.sendMessage({ type: "dat-ext:google-session-sync" }, (response) => {
    if (chrome.runtime.lastError) {
      return;
    }

    if (response?.ok && response.email) {
      applyConnectedGoogleAccount(response.email);
    }
  });
}

function loadUserAccountEmailFromStorage() {
  if (!globalThis.chrome?.storage?.local?.get) {
    maybeSilentGoogleSessionSync();
    return;
  }

  chrome.storage.local.get([DAT_EXT_USER_ACCOUNT_EMAIL_KEY], (result) => {
    const stored = String(result[DAT_EXT_USER_ACCOUNT_EMAIL_KEY] || "").trim();
    if (stored) {
      state.userAccountEmail = stored;
    }

    syncConnectEmailButton();
    const root = document.getElementById(HEADER_TOOLS_ID);
    if (root) {
      syncCompactEmailOptions(root);
    }
    scheduleScan(true);

    if (!stored && !String(state.userAccountEmail || "").trim()) {
      maybeSilentGoogleSessionSync();
    }
  });
}

function attachUserAccountEmailListener() {
  if (!globalThis.chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[DAT_EXT_USER_ACCOUNT_EMAIL_KEY]) {
      return;
    }

    state.userAccountEmail = String(changes[DAT_EXT_USER_ACCOUNT_EMAIL_KEY].newValue || "").trim();
    syncConnectEmailButton();
    const toolsRoot = document.getElementById(HEADER_TOOLS_ID);
    if (toolsRoot) {
      syncCompactEmailOptions(toolsRoot);
    }
    scheduleScan(true);
  });
}

function syncConnectEmailButton(root = document.getElementById(HEADER_TOOLS_ID)) {
  const btn = root?.querySelector('[data-action="connect-email"]');
  if (!(btn instanceof HTMLButtonElement)) {
    return;
  }

  const email = String(state.userAccountEmail || "").trim();
  btn.textContent = email ? "Settings & Inbox" : "Connect Account (Side Panel)";
  btn.title = email
    ? "Open the extension Side Panel for Gmail settings, TollGuru, and templates."
    : "Open the extension Side Panel to sign in with Google (not blocked by site pop-ups).";
}

function requestOpenSidePanel() {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return;
  }

  chrome.runtime.sendMessage({ type: "dat-ext:open-side-panel" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[DAT Dispatcher Assist] Side panel:", chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok && response?.error) {
      console.warn("[DAT Dispatcher Assist] Side panel:", response.error);
    }
  });
}

function bindInputsIfNeeded() {
  const root = document.getElementById(HEADER_TOOLS_ID);
  if (!root) {
    return;
  }

  if (state.inputsRoot === root && state.inputsSyncHandler) {
    return;
  }

  if (state.inputsRoot && state.inputsSyncHandler) {
    state.inputsRoot.removeEventListener("input", state.inputsSyncHandler);
    state.inputsRoot.removeEventListener("change", state.inputsSyncHandler);
  }

  const sync = () => {
    persistPrefs(readDraftPrefs(root));
    refreshApplyButtonState(root);
  };

  const apply = () => {
    applyDraftTargets(root);
    refreshApplyButtonState(root);
  };

  root.addEventListener("input", sync);
  root.addEventListener("change", sync);
  root.querySelector('[data-action="apply"]')?.addEventListener("click", apply);
  root.querySelector('[data-action="connect-email"]')?.addEventListener("click", () => {
    requestOpenSidePanel();
  });
  root.querySelector('[data-field="email-select"]')?.addEventListener("change", () => {
    persistEmailUiState({
      ...state.emailUiState,
      selectedEmail: String(root.querySelector('[data-field="email-select"]')?.value || "")
    });
  });
  root.querySelector('[data-field="template-select"]')?.addEventListener("change", () => {
    persistEmailUiState({
      ...state.emailUiState,
      selectedTemplate: String(root.querySelector('[data-field="template-select"]')?.value || "default")
    });
    scheduleScan(true);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        event.preventDefault();
        apply();
      }
    }
  });
  state.inputsRoot = root;
  state.inputsSyncHandler = sync;
  refreshApplyButtonState(root);
}

/**
 * DAT One search chrome: assist must mount inside `.search-controls` as the **first** child
 * so `flex: 1 1 100%` occupies its own row above origin/destination (see docs/dat-ui-corpus/13-extension-footprint.md).
 * `appendChild` leaves it after the SEARCH button, which reads as a compact card on the right.
 *
 * @returns {HTMLElement|null}
 */
function findAssistMountTarget() {
  const candidates = [
    () => document.querySelector("dat-search-form .search-filters"),
    () => document.querySelector(".search-filters.search-filters-updated"),
    () => document.querySelector(".search-filters"),
    () =>
      document.querySelector('[data-test="search-button"]')?.closest("form")?.querySelector(".search-controls"),
    () => document.querySelector("dat-search-form .search-controls"),
    () => document.querySelector("form.search-form .search-controls"),
    () => document.querySelector("form.search-form-updated .search-controls"),
    () => document.querySelector(".search-controls.search-controls-updated"),
    () => document.querySelector(".search-controls")
  ];

  for (const pick of candidates) {
    const el = pick();
    if (el instanceof HTMLElement && isVisible(el)) {
      return el;
    }
  }

  return findSearchChromeHost();
}

function isSearchControlsHost(element) {
  return (
    element instanceof HTMLElement &&
    (element.classList.contains("search-controls") || /\bsearch-controls\b/.test(String(element.className || "")))
  );
}

function isSearchFiltersHost(element) {
  return (
    element instanceof HTMLElement &&
    (element.classList.contains("search-filters") || /\bsearch-filters\b/.test(String(element.className || "")))
  );
}

function findSearchChromeHost() {
  /** @type {HTMLElement[]} */
  const hosts = [];

  const grid = findResultsGrid(document);
  if (grid) {
    let node = grid.parentElement;
    for (let depth = 0; depth < 24 && node; depth += 1) {
      if (!(node instanceof HTMLElement) || !isVisible(node)) {
        node = node.parentElement;
        continue;
      }

      const text = normalizeSpacing(node.innerText || "").toLowerCase();
      const hasCoreTokens =
        text.includes("origin") &&
        text.includes("destination") &&
        (text.includes("dh-o") || text.includes("dh o")) &&
        (text.includes("dh-d") || text.includes("dh d"));

      if (hasCoreTokens && text.includes("search")) {
        const controls = node.querySelectorAll('input, select, button, [role="combobox"]').length;
        const rect = node.getBoundingClientRect();
        if (controls >= 4 && rect.width > 520 && rect.height > 40) {
          hosts.push(node);
        }
      }

      node = node.parentElement;
    }
  }

  hosts.push(...collectLegacySearchHosts());

  if (!hosts.length) {
    return null;
  }

  const unique = [...new Set(hosts)];
  return unique.sort((left, right) => measureArea(left) - measureArea(right))[0];
}

function collectLegacySearchHosts() {
  const required = ["origin", "destination", "dh-o", "dh-d", "search"];
  const optional = ["load requirements", "search back", "private loads", "date range", "book/bid"];
  const exclude = ["view route", "contact information", "market rates"];

  const triggers = [...document.querySelectorAll("button, [role='button'], a")].filter((element) => {
    if (!(element instanceof HTMLElement) || !isVisible(element)) {
      return false;
    }

    const label = normalizeSpacing(element.textContent || "");
    return /^search$/i.test(label) || /load requirements/i.test(label);
  });

  /** @type {HTMLElement[]} */
  const collected = [];

  for (const trigger of triggers) {
    let current = trigger;

    for (let depth = 0; depth < 12 && current; depth += 1) {
      if (!(current instanceof HTMLElement) || !isVisible(current)) {
        break;
      }

      const text = normalizeSpacing(current.innerText || "").toLowerCase();
      if (!required.every((token) => text.includes(token))) {
        current = current.parentElement;
        continue;
      }

      if (exclude.some((token) => text.includes(token))) {
        current = current.parentElement;
        continue;
      }

      const optionalHit = optional.some((token) => text.includes(token));
      const looksLikeFilters =
        optionalHit ||
        /equipment(\s+type)?|load\s+type|length(\s+ft)?|weight(\s+lbs)?|date\s+range/i.test(text);

      const controlCount = current.querySelectorAll('input, select, button, [role="combobox"]').length;
      const rect = current.getBoundingClientRect();

      if (rect.width >= 620 && rect.height >= 46 && controlCount >= 5 && looksLikeFilters) {
        collected.push(current);
      }

      current = current.parentElement;
    }
  }

  return collected;
}

function normalizeSpacing(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function measureArea(element) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function buildHeaderTools(prefs) {
  const wrapper = document.createElement("div");
  wrapper.id = HEADER_TOOLS_ID;
  wrapper.className = ROOT_CLASS + " " + INJECTED_FLAG;

  const left = document.createElement("div");
  left.className = "my-ext-compact-left";
  left.append(
    buildHeaderButton(
      state.userAccountEmail ? "Settings & Inbox" : "Connect Account (Side Panel)",
      "connect-email"
    ),
    buildHeaderSelect("email-select", "Email", state.emailUiState.selectedEmail),
    buildTemplateSelect(state.emailUiState.selectedTemplate)
  );

  const right = document.createElement("div");
  right.className = "my-ext-compact-right";
  right.append(
    buildHeaderField("Rate", "target-rate", prefs.minRate),
    buildHeaderField("RPM", "target-rpm", prefs.minRpm),
    buildHeaderField("Miles", "target-miles", prefs.maxMiles),
    buildHeaderField("Weight", "target-weight", prefs.maxWeight),
    buildHeaderButton("Ignored (0)", "ignored", "ghost", "ignored"),
    buildHeaderButton("Apply", "apply")
  );

  const status = document.createElement("div");
  status.className = "my-ext-compact-status";
  status.dataset.role = "status";
  status.hidden = true;
  status.textContent = "";

  const emailHint = document.createElement("div");
  emailHint.className = "my-ext-email-hint";
  emailHint.dataset.role = "email-hint";
  emailHint.hidden = true;
  emailHint.textContent = "";

  wrapper.append(left, right, status, emailHint);
  return wrapper;
}

function buildHeaderField(placeholderText, fieldName, value) {
  const input = document.createElement("input");
  input.className = "my-ext-compact-input";
  input.type = "text";
  input.placeholder = placeholderText;
  input.autocomplete = "off";
  input.value = value || "";
  input.dataset.field = fieldName;
  input.setAttribute("aria-label", placeholderText);
  return input;
}

function buildHeaderButton(labelText, action, variant = "primary", role = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "my-ext-compact-btn my-ext-compact-btn--" + variant;
  button.dataset.action = action;
  if (role) {
    button.dataset.role = role;
  }
  if (action === "ignored") {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  }
  if (action === "apply") {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  }
  button.textContent = labelText;
  return button;
}

function buildHeaderSelect(fieldName, placeholder, initialValue = "") {
  const select = document.createElement("select");
  select.className = "my-ext-compact-select";
  select.dataset.field = fieldName;

  const fallback = document.createElement("option");
  fallback.value = "";
  fallback.textContent = initialValue || placeholder;
  select.appendChild(fallback);
  return select;
}

function buildTemplateSelect(initialValue = "default") {
  const select = document.createElement("select");
  select.className = "my-ext-compact-select";
  select.dataset.field = "template-select";

  const options = [
    { value: "default", label: "Default Template" },
    { value: "offer", label: "Offer Template" },
    { value: "booking", label: "Booking Template" }
  ];

  for (const config of options) {
    const option = document.createElement("option");
    option.value = config.value;
    option.textContent = config.label;
    if (config.value === initialValue) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  return select;
}

function trimNumericString(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return "";
  }
  return String(num);
}

function getAppliedTargetsAsDraft() {
  return {
    minRate: trimNumericString(state.appliedTargets.minRate),
    minRpm: trimNumericString(state.appliedTargets.minRpm),
    maxMiles: trimNumericString(state.appliedTargets.maxMiles),
    maxWeight: trimNumericString(state.appliedTargets.maxWeight)
  };
}

function normalizeDraftValue(raw) {
  const stripped = String(raw ?? "").replace(/[^0-9.]/g, "").trim();
  if (!stripped) {
    return "";
  }
  const num = Number.parseFloat(stripped);
  return Number.isFinite(num) && num > 0 ? String(num) : "";
}

function refreshApplyButtonState(root) {
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const applyBtn = root.querySelector('[data-action="apply"]');
  if (!(applyBtn instanceof HTMLButtonElement)) {
    return;
  }

  const draft = readDraftPrefs(root);
  const applied = getAppliedTargetsAsDraft();
  const changed =
    normalizeDraftValue(draft.minRate) !== normalizeDraftValue(applied.minRate) ||
    normalizeDraftValue(draft.minRpm) !== normalizeDraftValue(applied.minRpm) ||
    normalizeDraftValue(draft.maxMiles) !== normalizeDraftValue(applied.maxMiles) ||
    normalizeDraftValue(draft.maxWeight) !== normalizeDraftValue(applied.maxWeight);

  applyBtn.disabled = !changed;
  applyBtn.setAttribute("aria-disabled", changed ? "false" : "true");
}

function updateSummary(result, targets) {
  if (!state.summaryEl || !state.ignoredEl) {
    const root = document.getElementById(HEADER_TOOLS_ID);
    state.summaryEl = root?.querySelector('[data-role="status"]') ?? null;
    state.ignoredEl = root?.querySelector('[data-role="ignored"]') ?? null;
    if (root) {
      syncCompactEmailOptions(root);
    }
  }

  if (!state.summaryEl || !state.ignoredEl) {
    return;
  }

  const hasTargets =
    (targets.minRate ?? 0) > 0 ||
    (targets.minRpm ?? 0) > 0 ||
    (targets.maxMiles ?? 0) > 0 ||
    (targets.maxWeight ?? 0) > 0;

  state.summaryEl.textContent =
    result.rowCount > 0
      ? result.rowCount +
        " scanned | " +
        result.matched +
        " matches | " +
        result.partial +
        " partial | " +
        result.negotiate +
        " negotiate"
      : "No visible rows detected";
  state.ignoredEl.textContent = "Ignored (" + (hasTargets ? result.fail : 0) + ")";
}

function syncNativeHeaderStyles(headerHost, wrapper) {
  const toolsId = wrapper.id || HEADER_TOOLS_ID;
  /** @type {Element|null} */
  let nativeInput = null;

  for (const el of headerHost.querySelectorAll('input, [role="combobox"]')) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }

    if (toolsId && el.closest(`#${toolsId}`)) {
      continue;
    }

    nativeInput = el;
    break;
  }

  if (!nativeInput) {
    nativeInput =
      headerHost.querySelector("dat-search-location input") ||
      headerHost.querySelector(".controls-group mat-form-field input") ||
      headerHost.querySelector(".controls-group input");
  }

  if (!nativeInput || !(nativeInput instanceof HTMLElement)) {
    return;
  }

  const computed = window.getComputedStyle(nativeInput);
  wrapper.style.setProperty("--my-ext-native-height", computed.height || "40px");
  wrapper.style.setProperty("--my-ext-native-radius", computed.borderRadius || "8px");
  wrapper.style.setProperty("--my-ext-native-font-size", computed.fontSize || "14px");
  wrapper.style.setProperty("--my-ext-native-font-family", computed.fontFamily || "inherit");
}

function attachRouteIconDirectionsListener() {
  if (state.routeIconListenerAttached) {
    return;
  }
  document.addEventListener("click", onRouteIconClick, true);
  state.routeIconListenerAttached = true;
}

function attachRowSummaryDirectionsListener() {
  if (state.rowDirListenerAttached) {
    return;
  }
  document.addEventListener("click", onRowSummaryDirectionsClick, true);
  state.rowDirListenerAttached = true;
}

function onRowSummaryDirectionsClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const btn = target.closest(`[${ROW_DIR_ATTR}]`);
  if (!(btn instanceof HTMLElement)) {
    return;
  }

  const context = btn.getAttribute(ROW_DIR_CONTEXT_ATTR);
  /** @type {HTMLElement | null} */
  let detailHost = null;
  /** @type {Element | null} */
  let listRowFallback = null;

  if (context === "detail") {
    const detail = btn.closest("dat-load-details");
    detailHost = detail instanceof HTMLElement ? detail : null;
  } else {
    listRowFallback = btn.closest(".row-container, .table-row, [role='row'], tr, dat-row, dat-table-row");
  }

  const url =
    context === "detail"
      ? buildGoogleDirectionsUrlForPin(document, { detailHost })
      : listRowFallback instanceof Element
        ? buildGoogleDirectionsUrlForPin(document, { listRowFallback })
        : null;
  if (!url) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  window.open(url, "_blank", "noopener,noreferrer");
}

function onRouteIconClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const icon = target.closest("dat-orig-dest-icon.route-icon, dat-orig-dest-icon, .route-icon, #orig-dest-vertical_blue");
  if (!(icon instanceof Element)) {
    return;
  }

  const row = icon.closest(".table-row, .row-container, [role='row'], tr, dat-row, dat-table-row");
  if (!(row instanceof Element)) {
    return;
  }

  const url = buildGoogleDirectionsUrlForRow(document, row);
  if (!url) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  window.open(url, "_blank", "noopener,noreferrer");
}
