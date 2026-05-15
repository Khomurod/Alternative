/** Gmail side rail (Shadow DOM): fixed right column; `body.dat-ext-drawer-open` reserves width in [styles.css]. */

const DRAWER_HOST_ID = "dat-ext-gmail-drawer";
const BODY_PUSH_CLASS = "dat-ext-drawer-open";
const HOST_OPEN_CLASS = "dat-ext-gmail-drawer--open";
const TRANSITION_MS = 300;

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
let railEl = /** @type {HTMLElement | null} */ (null);

/** @type {ReturnType<typeof setTimeout> | null} */
let closeBodyTimer = null;

function buildDrawerStyles() {
  return `
  :host {
    all: initial;
    display: block;
    position: fixed;
    right: 0;
    top: 0;
    height: 100vh;
    width: var(--dat-ext-gmail-drawer-width, 320px);
    z-index: 99999;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    pointer-events: none;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 13px;
    color: #101828;
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: border-box; }
  :host(.${HOST_OPEN_CLASS}) {
    transform: translateX(0);
    pointer-events: auto;
  }
  .rail {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fff;
    box-shadow: -8px 0 28px rgba(15, 23, 42, 0.12);
    border-left: 1px solid #e4e7ec;
    min-height: 0;
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
  .compose {
    flex: 0 1 auto;
    overflow: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 52vh;
    min-height: 0;
    border-bottom: 1px solid #eaecf0;
  }
  .inbox {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    min-height: 100px;
    resize: vertical;
    line-height: 1.45;
    max-height: 200px;
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
    margin: 0;
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
  .thread-subj {
    font-size: 12px;
    font-weight: 700;
    color: #101828;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .thread-from {
    font-size: 11px;
    font-weight: 600;
    color: #60708a;
    margin-top: 4px;
    word-break: break-word;
  }
  .thread-snippet {
    font-size: 12px;
    color: #344054;
    line-height: 1.35;
    margin-top: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
  if (rootHost?.isConnected && shadowRootRef && railEl) {
    return;
  }

  rootHost = document.createElement("aside");
  rootHost.id = DRAWER_HOST_ID;
  rootHost.setAttribute("role", "complementary");
  rootHost.setAttribute("aria-label", "Gmail compose and recent emails");
  shadowRootRef = rootHost.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildDrawerStyles();

  railEl = document.createElement("div");
  railEl.className = "rail";
  railEl.innerHTML = `
    <div class="hdr">
      <div>
        <h2 id="dat-ext-gmail-drawer-title">Gmail</h2>
        <div class="hdr-meta" data-part="subtitle"></div>
      </div>
      <button type="button" class="btn-icon" data-action="close" aria-label="Close Gmail panel">×</button>
    </div>
    <div class="compose">
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
    </div>
    <div class="inbox">
      <div class="threads-h">Recent emails</div>
      <div class="loading" data-part="threads-loading">Loading…</div>
      <ul class="thread-list" data-part="threads" hidden></ul>
    </div>
  `;

  shadowRootRef.append(style, railEl);

  rootHost.dataset.datExtDrawer = "rail";
  document.body.appendChild(rootHost);

  railEl.querySelector('[data-action="close"]')?.addEventListener("click", () => closeDatExtGmailDrawer());
  railEl.querySelector('[data-action="signin"]')?.addEventListener("click", () => {
    drawerConfig.onRequestGoogleLogin?.();
  });
}

function getRefs() {
  const rail = railEl;
  if (!rail) {
    return {};
  }
  return {
    subtitle: rail.querySelector('[data-part="subtitle"]'),
    chips: rail.querySelector('[data-part="chips"]'),
    status: rail.querySelector('[data-part="status"]'),
    threadsLoading: rail.querySelector('[data-part="threads-loading"]'),
    threadsUl: rail.querySelector('[data-part="threads"]'),
    to: rail.querySelector('[data-field="to"]'),
    subject: rail.querySelector('[data-field="subject"]'),
    body: rail.querySelector('[data-field="body"]'),
    sendBtn: rail.querySelector('[data-action="send"]')
  };
}

export function closeDatExtGmailDrawer() {
  document.removeEventListener("keydown", onEscapeDocument);
  rootHost?.classList.remove(HOST_OPEN_CLASS);

  if (closeBodyTimer) {
    clearTimeout(closeBodyTimer);
    closeBodyTimer = null;
  }
  closeBodyTimer = window.setTimeout(() => {
    document.body.classList.remove(BODY_PUSH_CLASS);
    closeBodyTimer = null;
  }, TRANSITION_MS);
}

function onEscapeDocument(e) {
  if (e.key === "Escape") {
    closeDatExtGmailDrawer();
  }
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

function fetchRecentMessages(contactEmail) {
  return new Promise((resolve, reject) => {
    const rt = globalThis.chrome?.runtime;
    if (!rt?.sendMessage) {
      reject(new Error("Extension messaging unavailable."));
      return;
    }
    rt.sendMessage(
      { type: "dat-ext:gmail-recent-messages", contactEmail: String(contactEmail || "").trim() },
      (response) => {
        const last = typeof chrome !== "undefined" ? chrome.runtime?.lastError : undefined;
        if (last) {
          reject(new Error(last.message || "Recent messages failed."));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Recent messages failed."));
          return;
        }
        resolve(Array.isArray(response.messages) ? response.messages : []);
      }
    );
  });
}

/**
 * @param {string} contactEmail
 */
async function loadRecentIntoDrawer(contactEmail) {
  const refs = getRefs();
  if (!refs.threadsLoading || !refs.threadsUl) {
    return;
  }
  refs.threadsLoading.hidden = false;
  refs.threadsLoading.textContent = "Loading recent emails…";
  refs.threadsUl.hidden = true;
  refs.threadsUl.replaceChildren();
  try {
    const messages = /** @type {{ id: string, subject: string, from: string, snippet: string }[]} */ (
      await fetchRecentMessages(contactEmail)
    );
    refs.threadsLoading.hidden = messages.length === 0;
    refs.threadsUl.hidden = messages.length === 0;
    if (!messages.length) {
      refs.threadsLoading.textContent = "No recent messages match this search.";
      return;
    }
    refs.threadsLoading.hidden = true;
    for (const m of messages) {
      const li = document.createElement("li");
      li.className = "thread-li";
      const subj = document.createElement("div");
      subj.className = "thread-subj";
      subj.textContent = m.subject || "(No subject)";
      const from = document.createElement("div");
      from.className = "thread-from";
      from.textContent = m.from || "";
      const sn = document.createElement("div");
      sn.className = "thread-snippet";
      sn.textContent = m.snippet || "(No preview)";
      li.append(subj, from, sn);
      refs.threadsUl.appendChild(li);
    }
  } catch (e) {
    refs.threadsLoading.hidden = false;
    refs.threadsUl.hidden = true;
    refs.threadsLoading.textContent = String(
      /** @type {{ message?: string }} */ (e)?.message || e || "Could not load recent emails."
    );
  }
}

/**
 * @param {GmailDrawerPayload} payload
 */
export function openDatExtGmailDrawer(payload) {
  ensureDrawerDom();

  if (closeBodyTimer) {
    clearTimeout(closeBodyTimer);
    closeBodyTimer = null;
  }

  const refs = getRefs();
  if (!rootHost || !refs.to || !refs.subject || !refs.body || !refs.sendBtn || !railEl) {
    return;
  }

  document.body.classList.add(BODY_PUSH_CLASS);
  document.removeEventListener("keydown", onEscapeDocument);
  document.addEventListener("keydown", onEscapeDocument);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      rootHost?.classList.add(HOST_OPEN_CLASS);
    });
  });

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

  refs.sendBtn.onclick = async () => {
    hideStatus();
    refs.sendBtn.disabled = true;
    try {
      await sendGmailFromDrawer(refs.to.value, refs.subject.value, refs.body.value);
      showStatus("Email sent.", false);
      notifyTomPanelToast(payload.shadowHost, "Email sent.", "success");
      await loadRecentIntoDrawer(payload.contactEmail);
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

  void loadRecentIntoDrawer(payload.contactEmail);
}
