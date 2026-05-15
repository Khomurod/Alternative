/** Right-side Gmail drawer (Shadow DOM). Gmail REST calls go through `background.js` via chrome.runtime.sendMessage. */

/** @typedef {{ onRequestGoogleLogin?: (() => void) | null }} DrawerConfig */

/** @type {DrawerConfig} */
let drawerConfig = {};

/**
 * @param {DrawerConfig} options
 */
export function configureDatExtGmailDrawer(options) {
  drawerConfig = { ...drawerConfig, ...options };
}

/**
 * @typedef {{
 *   mode: "offer" | "booking",
 *   contactEmail: string,
 *   subject: string,
 *   body: string,
 *   chips?: Record<string, string>,
 *   shadowHost?: HTMLElement | null,
 *   userAccountEmail?: string
 * }} GmailDrawerPayload
 */

let rootHost = /** @type {HTMLElement | null} */ (null);
/** @type {ShadowRoot | null} */
let shadowRootRef = /** @type {ShadowRoot | null} */ (null);
/** @type {HTMLElement | null} */
let panelEl = /** @type {HTMLElement | null} */ (null);

/** @type {(() => void) | null} */
let releaseTrap = null;

/** @type {HTMLElement | null} */
let lastFocus = null;

function buildDrawerStyles() {
  return `
  :host { all: initial; }
  *, *::before, *::after { box-sizing: border-box; }
  .layer {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 13px;
    color: #101828;
  }
  .layer.open { pointer-events: auto; }
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    width: 100%;
    height: 100%;
    display: block;
    background: rgba(15, 23, 42, 0.38);
    backdrop-filter: blur(2px);
    opacity: 0;
    transition: opacity 0.2s ease-out;
    cursor: pointer;
  }
  .layer.open .backdrop { opacity: 1; }
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    height: 100vh;
    width: clamp(320px, 42vw, 440px);
    max-width: 100vw;
    background: #fff;
    box-shadow: -8px 0 32px rgba(15, 23, 42, 0.14);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    outline: none;
  }
  .layer.open .panel {
    transform: translateX(0);
  }
  .hdr {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid #e4e7ec;
    background: #fafbff;
  }
  .hdr h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .hdr-meta {
    font-size: 11px;
    color: #60708a;
    font-weight: 600;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btn-icon {
    border: none;
    background: transparent;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
    color: #475467;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btn-icon:hover { background: #eef2ff; color: #0b66ff; }
  .scroll {
    flex: 1 1 auto;
    overflow: auto;
    padding: 12px 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 999px;
    background: #f2f4f7;
    color: #344054;
    border: 1px solid #e4e7ec;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  label.lbl {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #60708a;
    letter-spacing: 0.02em;
  }
  input.inp, textarea.inp {
    border: 1px solid #d0d5dd;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    color: #101828;
    background: #fff;
    width: 100%;
  }
  textarea.inp {
    min-height: 140px;
    resize: vertical;
    line-height: 1.45;
  }
  input.inp:focus, textarea.inp:focus {
    outline: none;
    border-color: #0b66ff;
    box-shadow: 0 0 0 3px rgba(11, 102, 255, 0.18);
  }
  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .btn-primary {
    border: 1px solid #0b66ff;
    background: #0b66ff;
    color: #fff;
    font-weight: 700;
    padding: 9px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.06); }
  .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-ghost {
    border: 1px dashed #cfd6e5;
    background: #fff;
    color: #34507a;
    font-weight: 600;
    padding: 9px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
  }
  .threads-h {
    font-size: 12px;
    font-weight: 700;
    color: #475467;
    margin: 4px 0 2px;
  }
  .thread-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .thread-li {
    border: 1px solid #e4e7ec;
    border-radius: 8px;
    padding: 10px;
    background: #fbfcfe;
    cursor: default;
  }
  .thread-snippet {
    font-size: 12px;
    color: #344054;
    line-height: 1.35;
    margin-top: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .thread-id {
    font-size: 10px;
    font-weight: 700;
    color: #98a2b3;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .status {
    font-size: 12px;
    font-weight: 600;
    padding: 8px 10px;
    border-radius: 8px;
    display: none;
  }
  .status.show { display: block; }
  .status.err {
    background: #fef3f2;
    color: #b42318;
    border: 1px solid #fecdca;
  }
  .status.ok {
    background: #ecfdf3;
    color: #027a48;
    border: 1px solid #abefc6;
  }
  .loading {
    font-size: 12px;
    color: #60708a;
    font-weight: 600;
  }
  `;
}

function ensureDrawerDom() {
  if (rootHost?.isConnected && shadowRootRef && panelEl) {
    return;
  }

  rootHost = document.createElement("div");
  rootHost.id = "dat-ext-gmail-drawer-host";
  rootHost.setAttribute("data-dat-ext-gmail-drawer", "1");
  shadowRootRef = rootHost.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildDrawerStyles();

  const layer = document.createElement("div");
  layer.className = "layer";

  const backdropEl = document.createElement("button");
  backdropEl.type = "button";
  backdropEl.className = "backdrop";
  backdropEl.setAttribute("aria-label", "Close inbox drawer");

  panelEl = document.createElement("div");
  panelEl.className = "panel";
  panelEl.setAttribute("role", "dialog");
  panelEl.setAttribute("aria-modal", "true");
  panelEl.setAttribute("aria-labelledby", "dat-ext-gmail-drawer-title");
  panelEl.tabIndex = -1;

  panelEl.innerHTML = `
    <div class="hdr">
      <div>
        <h2 id="dat-ext-gmail-drawer-title">Gmail</h2>
        <div class="hdr-meta" data-part="subtitle"></div>
      </div>
      <button type="button" class="btn-icon" data-action="close" aria-label="Close">×</button>
    </div>
    <div class="scroll">
      <div class="status" data-part="status" role="status" aria-live="polite"></div>
      <div class="chips" data-part="chips"></div>
      <label class="lbl">To
        <input class="inp" data-field="to" type="email" autocomplete="email" />
      </label>
      <label class="lbl">Subject
        <input class="inp" data-field="subject" type="text" autocomplete="off" />
      </label>
      <label class="lbl">Message
        <textarea class="inp" data-field="body" spellcheck="true"></textarea>
      </label>
      <div class="btn-row">
        <button type="button" class="btn-primary" data-action="send">Send email</button>
        <button type="button" class="btn-ghost" data-action="signin">Sign in with Google</button>
      </div>
      <div class="threads-h">Recent threads</div>
      <div class="loading" data-part="threads-loading">Loading…</div>
      <ul class="thread-list" data-part="threads" hidden></ul>
    </div>
  `;

  layer.append(backdropEl, panelEl);
  shadowRootRef.append(style, layer);

  document.body.appendChild(rootHost);

  backdropEl.addEventListener("click", () => closeDatExtGmailDrawer());
  panelEl.querySelector('[data-action="close"]')?.addEventListener("click", () => closeDatExtGmailDrawer());
  panelEl.querySelector('[data-action="signin"]')?.addEventListener("click", () => {
    drawerConfig.onRequestGoogleLogin?.();
  });
}

function getLayer() {
  return shadowRootRef?.querySelector(".layer") ?? null;
}

function getRefs() {
  const panel = panelEl;
  if (!panel) {
    return {};
  }
  return {
    subtitle: panel.querySelector('[data-part="subtitle"]'),
    chips: panel.querySelector('[data-part="chips"]'),
    status: panel.querySelector('[data-part="status"]'),
    threadsLoading: panel.querySelector('[data-part="threads-loading"]'),
    threadsUl: panel.querySelector('[data-part="threads"]'),
    to: panel.querySelector('[data-field="to"]'),
    subject: panel.querySelector('[data-field="subject"]'),
    body: panel.querySelector('[data-field="body"]'),
    sendBtn: panel.querySelector('[data-action="send"]')
  };
}

export function closeDatExtGmailDrawer() {
  document.removeEventListener("keydown", onEscapeDocument);

  const layer = getLayer();
  layer?.classList.remove("open");

  releaseTrap?.();
  releaseTrap = null;

  window.setTimeout(() => {
    if (layer && !layer.classList.contains("open") && rootHost) {
      rootHost.style.visibility = "hidden";
    }
  }, 280);

  if (lastFocus instanceof HTMLElement && document.body.contains(lastFocus)) {
    lastFocus.focus({ preventScroll: true });
  }
  lastFocus = null;
}

function onEscapeDocument(e) {
  if (e.key === "Escape") {
    closeDatExtGmailDrawer();
  }
}

/**
 * @param {HTMLElement} panel
 */
function attachFocusTrap(panel) {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  /** @returns {HTMLElement[]} */
  function focusables() {
    return [...panel.querySelectorAll(selector)].filter(
      (el) =>
        el instanceof HTMLElement &&
        !el.hasAttribute("disabled") &&
        el.tabIndex !== -1 &&
        !el.hidden &&
        (el.offsetParent !== null || el === document.activeElement)
    );
  }
  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    if (e.key !== "Tab") {
      return;
    }
    const list = focusables();
    if (!list.length) {
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const ae = document.activeElement;
    const activeInside = ae instanceof HTMLElement && panel.contains(ae);
    if (e.shiftKey) {
      if (!activeInside || ae === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!activeInside || ae === last) {
      e.preventDefault();
      first.focus();
    }
  }
  panel.addEventListener("keydown", onKeyDown);
  return () => panel.removeEventListener("keydown", onKeyDown);
}

function hideStatus() {
  const st = getRefs().status;
  if (!st) {
    return;
  }
  st.classList.remove("show", "err", "ok");
  st.textContent = "";
}

/**
 * @param {string} text
 * @param {boolean} isErr
 */
function showStatus(text, isErr) {
  const st = getRefs().status;
  if (!st) {
    return;
  }
  st.textContent = text;
  st.classList.remove("err", "ok");
  st.classList.add("show", isErr ? "err" : "ok");
}

/**
 * @param {string} key
 */
function formatChipKey(key) {
  const map = {
    origin: "Origin",
    destination: "Dest",
    rpm: "RPM",
    miles: "Miles",
    rate: "Rate",
    toll: "Toll",
    company: "Company"
  };
  return map[key] || key;
}

/**
 * @param {HTMLElement | null | undefined} shadowHost
 * @param {string} message
 * @param {"success" | "error"} variant
 */
function notifyTomPanelToast(shadowHost, message, variant) {
  const root = shadowHost?.shadowRoot;
  if (!root || !message) {
    return;
  }
  let layerToast = root.querySelector(".dat-ext-toast-layer");
  if (!layerToast) {
    layerToast = document.createElement("div");
    layerToast.className = "dat-ext-toast-layer";
    layerToast.setAttribute("aria-live", "polite");
    root.appendChild(layerToast);
  }
  const t = document.createElement("div");
  t.className = `dat-ext-toast dat-ext-toast--${variant === "error" ? "error" : "success"}`;
  t.textContent = message;
  layerToast.appendChild(t);
  globalThis.setTimeout(() => {
    t.remove();
    if (layerToast instanceof HTMLElement && !layerToast.childElementCount) {
      layerToast.remove();
    }
  }, 4500);
}

function sendGmailFromDrawer(to, subject, body) {
  return new Promise((resolve, reject) => {
    const rt = globalThis.chrome?.runtime;
    if (!rt?.sendMessage) {
      reject(new Error("Extension messaging unavailable."));
      return;
    }
    rt.sendMessage({ type: "dat-ext:gmail-send", to, subject, body }, (response) => {
      const last = typeof chrome !== "undefined" ? chrome.runtime?.lastError : undefined;
      if (last) {
        reject(new Error(last.message || "Send failed."));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Send failed."));
        return;
      }
      resolve(response);
    });
  });
}

function fetchThreads(contactEmail) {
  return new Promise((resolve, reject) => {
    const rt = globalThis.chrome?.runtime;
    if (!rt?.sendMessage) {
      reject(new Error("Extension messaging unavailable."));
      return;
    }
    rt.sendMessage(
      { type: "dat-ext:gmail-threads-list", contactEmail: String(contactEmail || "").trim(), maxResults: 10 },
      (response) => {
        const last = typeof chrome !== "undefined" ? chrome.runtime?.lastError : undefined;
        if (last) {
          reject(new Error(last.message || "Threads failed."));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Threads failed."));
          return;
        }
        resolve(Array.isArray(response.threads) ? response.threads : []);
      }
    );
  });
}

/**
 * @param {string} contactEmail
 */
async function loadThreadsIntoDrawer(contactEmail) {
  const refs = getRefs();
  if (!refs.threadsLoading || !refs.threadsUl) {
    return;
  }
  refs.threadsLoading.hidden = false;
  refs.threadsLoading.textContent = "Loading threads…";
  refs.threadsUl.hidden = true;
  refs.threadsUl.replaceChildren();
  try {
    const threads = /** @type {{ id: string, snippet: string }[]} */ (await fetchThreads(contactEmail));
    refs.threadsLoading.hidden = threads.length === 0;
    refs.threadsUl.hidden = threads.length === 0;
    if (!threads.length) {
      refs.threadsLoading.textContent = "No recent threads match this contact.";
      return;
    }
    refs.threadsLoading.hidden = true;
    for (const t of threads) {
      const li = document.createElement("li");
      li.className = "thread-li";
      const idEl = document.createElement("div");
      idEl.className = "thread-id";
      idEl.textContent = "Conversation";
      const sn = document.createElement("div");
      sn.className = "thread-snippet";
      sn.textContent = t.snippet || "(No preview)";
      li.append(idEl, sn);
      refs.threadsUl.appendChild(li);
    }
  } catch (e) {
    refs.threadsLoading.hidden = false;
    refs.threadsUl.hidden = true;
    refs.threadsLoading.textContent = String(
      /** @type {{ message?: string }} */ (e)?.message || e || "Could not load threads."
    );
  }
}

/**
 * @param {GmailDrawerPayload} payload
 */
export function openDatExtGmailDrawer(payload) {
  ensureDrawerDom();

  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const refs = getRefs();
  const layer = getLayer();
  if (!layer || !refs.to || !refs.subject || !refs.body || !refs.sendBtn || !panelEl) {
    return;
  }

  rootHost.style.visibility = "visible";
  layer.classList.add("open");

  hideStatus();
  refs.chips.replaceChildren();
  if (payload.chips && typeof payload.chips === "object") {
    for (const [k, v] of Object.entries(payload.chips)) {
      const val = String(v ?? "").trim();
      if (!val || val === "--") {
        continue;
      }
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${formatChipKey(k)}: ${val}`;
      refs.chips.appendChild(chip);
    }
  }

  refs.to.value = String(payload.contactEmail || "").trim();
  refs.subject.value = String(payload.subject || "").trim();
  refs.body.value = String(payload.body || "").trim();

  const modeLabel = payload.mode === "booking" ? "Booking email" : "Offer email";
  if (refs.subtitle) {
    refs.subtitle.textContent = `${modeLabel}${payload.userAccountEmail ? ` · ${payload.userAccountEmail}` : ""}`;
  }

  document.removeEventListener("keydown", onEscapeDocument);
  document.addEventListener("keydown", onEscapeDocument);

  releaseTrap?.();
  releaseTrap = attachFocusTrap(panelEl);

  window.requestAnimationFrame(() => {
    refs.subject?.focus();
  });

  refs.sendBtn.onclick = async () => {
    hideStatus();
    refs.sendBtn.disabled = true;
    try {
      await sendGmailFromDrawer(refs.to.value, refs.subject.value, refs.body.value);
      showStatus("Email sent.", false);
      notifyTomPanelToast(payload.shadowHost, "Email sent.", "success");
      await loadThreadsIntoDrawer(payload.contactEmail);
    } catch (err) {
      const msg = String(
        /** @type {{ message?: string }} */ (err)?.message || err || "Send failed."
      );
      showStatus(msg, true);
      notifyTomPanelToast(payload.shadowHost, msg, "error");
    } finally {
      refs.sendBtn.disabled = false;
    }
  };

  void loadThreadsIntoDrawer(payload.contactEmail);
}
