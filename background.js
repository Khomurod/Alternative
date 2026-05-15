import { DAT_EXT_USER_ACCOUNT_EMAIL_KEY } from "./src/google-account.js";
import { sanitizeFetchJsonHeaders, validateFetchUrl } from "./src/fetch-url-guard.js";
import { buildGmailApiRaw, snippetForLogs, validateGmailSendPayload } from "./src/gmail-send.js";

const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[DAT Dispatcher Assist] Extension installed:", details.reason);
  configureExtensionSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  configureExtensionSidePanel();
});

/** Toolbar icon opens the Side Panel hub (popup removed). */
function configureExtensionSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

configureExtensionSidePanel();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "dat-ext:open-side-panel") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "No tab context for side panel" });
      return;
    }
    chrome.sidePanel
      .open({ tabId })
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: String(err?.message || err || chrome.runtime.lastError?.message || "sidePanel.open failed")
        })
      );
    return true;
  }

  if (message?.type === "my-ext:ping") {
    sendResponse({
      ok: true,
      tabId: sender.tab?.id ?? null
    });
    return;
  }

  if (message?.type === "dat-ext:google-login") {
    handleGoogleLogin()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          cancelled: false,
          error: String(error?.message || error || "Google login failed")
        })
      );
    return true;
  }

  if (message?.type === "dat-ext:google-session-sync") {
    handleGoogleSessionSync()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, silent: true }));
    return true;
  }

  if (message?.type === "dat-ext:google-logout") {
    handleGoogleLogout()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: String(error?.message || error || "Google sign-out failed")
        })
      );
    return true;
  }

  if (message?.type === "dat-ext:fetch-json") {
    handleFetchJson(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || "Fetch failed") }));
    return true;
  }

  if (message?.type === "dat-ext:gmail-send") {
    handleGmailSend(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        const msg = String(error?.message || error || "Gmail send failed");
        if (isOAuthCancelled(msg)) {
          sendResponse({ ok: false, cancelled: true, error: msg });
          return;
        }
        sendResponse({ ok: false, error: msg });
      });
    return true;
  }

  if (message?.type === "dat-ext:gmail-threads-list") {
    handleGmailThreadsList(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        const msg = String(error?.message || error || "Gmail threads failed");
        if (isOAuthCancelled(msg)) {
          sendResponse({ ok: false, cancelled: true, error: msg });
          return;
        }
        sendResponse({ ok: false, error: msg });
      });
    return true;
  }

  if (message?.type === "dat-ext:gmail-recent-messages") {
    handleGmailRecentMessages(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        const msg = String(error?.message || error || "Gmail recent messages failed");
        if (isOAuthCancelled(msg)) {
          sendResponse({ ok: false, cancelled: true, error: msg });
          return;
        }
        sendResponse({ ok: false, error: msg });
      });
    return true;
  }

  if (message?.type === "dat-ext:test-tollguru") {
    handleTestTollguru(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: String(error?.message || error || "TollGuru test failed")
        })
      );
    return true;
  }
});

/**
 * Clears OAuth state for this extension: removes cached tokens locally, best-effort revokes at Google,
 * then clears remaining identity cache and drops persisted board UI email (TollGuru / templates unchanged).
 *
 * Full server-side invalidation depends on the revoke request succeeding; cache-only clears still allow
 * reuse until consent is re-established if revoke fails.
 *
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function handleGoogleLogout() {
  try {
    let token = null;
    try {
      token = await getAuthToken({ interactive: false });
    } catch {
      /* No silent token — still clear cache below */
    }

    if (token) {
      await removeCachedToken(token);
      await revokeGoogleTokenBestEffort(token);
    }

    await new Promise((resolve, reject) => {
      chrome.identity.clearAllCachedAuthTokens(() => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "clearAllCachedAuthTokens failed"));
          return;
        }
        resolve();
      });
    });
    await chrome.storage.local.remove(DAT_EXT_USER_ACCOUNT_EMAIL_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "Google sign-out failed") };
  }
}

/**
 * @param {string} token
 */
async function revokeGoogleTokenBestEffort(token) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token })
    });
  } catch {
    /* ignore — local cache removal still applies */
  }
}

/**
 * Exchange access token for email and persist `DAT_EXT_USER_ACCOUNT_EMAIL_KEY` (never stores the token).
 *
 * @param {string} token
 * @returns {Promise<{ ok: true, email: string }>}
 */
async function fetchGoogleAccountEmailWithToken(token) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Userinfo request failed (${response.status})`);
  }

  const data = await response.json();
  const email = String(data?.email || "").trim();
  if (!email) {
    throw new Error("Google account did not return an email address");
  }

  await chrome.storage.local.set({ [DAT_EXT_USER_ACCOUNT_EMAIL_KEY]: email });
  return { ok: true, email };
}

/**
 * Silent refresh only — no interactive UI. Used when DAT loads and storage may be missing email.
 *
 * @returns {Promise<{ ok: true, email: string } | { ok: false, silent: true }>}
 */
async function handleGoogleSessionSync() {
  try {
    const token = await getAuthToken({ interactive: false });
    return await fetchGoogleAccountEmailWithToken(token);
  } catch {
    return { ok: false, silent: true };
  }
}

async function handleGoogleLogin() {
  try {
    let token;
    try {
      token = await getAuthToken({ interactive: false });
    } catch {
      token = await getAuthTokenInteractive();
    }

    try {
      return await fetchGoogleAccountEmailWithToken(token);
    } catch (err) {
      const msg = String(err?.message || err || "");
      const statusMatch = msg.match(/Userinfo request failed \((\d+)\)/);
      const status = statusMatch ? Number(statusMatch[1]) : 0;
      if (status === 401) {
        await removeCachedToken(token);
        const token2 = await getAuthTokenInteractive();
        return await fetchGoogleAccountEmailWithToken(token2);
      }
      throw err;
    }
  } catch (error) {
    const message = String(error?.message || error || "Google login failed");
    if (isOAuthCancelled(message)) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, error: message };
  }
}

/**
 * @returns {Promise<string>}
 */
function getAuthTokenInteractive() {
  return getAuthToken({ interactive: true });
}

/**
 * @param {{ interactive: boolean }} opts
 * @returns {Promise<string>}
 */
function getAuthToken(opts) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(opts, (token) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || "Failed to obtain Google auth token"));
        return;
      }
      if (!token) {
        reject(new Error("No Google auth token returned"));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * @param {string | null | undefined} token
 * @returns {Promise<void>}
 */
function removeCachedToken(token) {
  return new Promise((resolve) => {
    if (!token) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

/**
 * @param {*} message
 * @returns {Promise<{ ok: true, id?: string } | { ok: false, error: string, cancelled?: boolean }>}
 */
async function handleGmailSend(message) {
  const { to, subject, body } = validateGmailSendPayload(message);
  const raw = buildGmailApiRaw({ to, subject, body });
  console.info("[DAT Dispatcher Assist] Gmail send:", {
    to,
    subjectLen: subject.length,
    bodySnippet: snippetForLogs(body)
  });

  /** @type {string | undefined} */
  let token;
  try {
    token = await getAuthToken({ interactive: false });
  } catch {
    token = await getAuthToken({ interactive: true });
  }

  async function postSend(t) {
    return fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw })
    });
  }

  let response = await postSend(token);

  if (response.status === 401) {
    await removeCachedToken(token);
    token = await getAuthTokenInteractive();
    response = await postSend(token);
  }

  if (!response.ok) {
    const detail = await readFailedFetchDetail(response.status, response);
    throw new Error(detail.replace(/^HTTP \d+/, "Gmail send failed"));
  }

  const data = await response.json().catch(() => null);
  const id = typeof data?.id === "string" ? data.id : undefined;

  return { ok: true, id };
}

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/";

/**
 * Authenticated Gmail JSON request (service worker only).
 *
 * @param {"GET"|"POST"} method
 * @param {string} pathAndQuery path after /v1/ including query string
 */
async function gmailAuthenticatedJson(method, pathAndQuery) {
  const urlStr = `${GMAIL_API_BASE}${pathAndQuery}`;
  validateFetchUrl(urlStr);

  /** @type {string | undefined} */
  let token;
  try {
    token = await getAuthToken({ interactive: false });
  } catch {
    token = await getAuthToken({ interactive: true });
  }

  async function req(t) {
    return fetch(urlStr, {
      method,
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/json"
      }
    });
  }

  let response = await req(token);

  if (response.status === 401) {
    await removeCachedToken(token);
    token = await getAuthTokenInteractive();
    response = await req(token);
  }

  if (!response.ok) {
    const detail = await readFailedFetchDetail(response.status, response);
    throw new Error(detail.replace(/^HTTP \d+/, "Gmail request failed"));
  }

  return response.json();
}

/**
 * @param {*} data
 * @returns {{ id: string, snippet: string, historyId?: string }[]}
 */
function sanitizeThreadsForUi(data) {
  const threads = Array.isArray(data?.threads) ? data.threads : [];
  const out = [];
  for (const t of threads) {
    const id = typeof t?.id === "string" ? t.id.trim() : "";
    if (!id) {
      continue;
    }
    const snippet = typeof t?.snippet === "string" ? t.snippet.replace(/\s+/g, " ").trim().slice(0, 280) : "";
    const historyId = typeof t?.historyId === "string" ? t.historyId : undefined;
    out.push({ id, snippet, ...(historyId ? { historyId } : {}) });
  }
  return out;
}

/**
 * @param {*} message
 * @returns {Promise<{ ok: true, threads: ReturnType<typeof sanitizeThreadsForUi>, resultSizeEstimate?: number }>}
 */
async function handleGmailThreadsList(message) {
  const maxRaw = Number(message?.maxResults);
  const maxResults = Math.min(25, Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 10));

  const contactEmail = String(message?.contactEmail || "")
    .trim()
    .slice(0, 254);
  let q = String(message?.query || "").trim();

  if (!q) {
    q = contactEmail ? `(from:${contactEmail} OR to:${contactEmail})` : "newer_than:14d";
  }

  const params = new URLSearchParams({
    maxResults: String(maxResults),
    q
  });

  const data = await gmailAuthenticatedJson("GET", `users/me/threads?${params.toString()}`);
  const threads = sanitizeThreadsForUi(data);
  const estimate =
    typeof data?.resultSizeEstimate === "number" && Number.isFinite(data.resultSizeEstimate)
      ? data.resultSizeEstimate
      : undefined;

  return { ok: true, threads, ...(estimate !== undefined ? { resultSizeEstimate: estimate } : {}) };
}

/**
 * @param {*} msg
 * @param {string} headerName
 * @returns {string}
 */
function getGmailMessageHeader(msg, headerName) {
  const headers = msg?.payload?.headers;
  if (!Array.isArray(headers)) {
    return "";
  }
  const needle = String(headerName || "").trim().toLowerCase();
  const hit = headers.find((h) => String(h?.name || "").trim().toLowerCase() === needle);
  return typeof hit?.value === "string" ? hit.value.trim() : "";
}

/**
 * @typedef {{ id: string, subject: string, from: string, snippet: string, threadId?: string, internalDate?: string }} GmailRecentUiMessage
 */

/**
 * @param {*} message
 * @returns {Promise<{ ok: true, messages: GmailRecentUiMessage[] }>}
 */
async function handleGmailRecentMessages(message) {
  const contactEmail = String(message?.contactEmail || "")
    .trim()
    .slice(0, 254);
  let q = String(message?.query || "").trim();

  if (!q) {
    q = contactEmail ? `(from:${contactEmail} OR to:${contactEmail})` : "in:inbox newer_than:14d";
  }

  const listParams = new URLSearchParams({
    maxResults: "5",
    includeSpamTrash: "false",
    q
  });

  const listed = await gmailAuthenticatedJson("GET", `users/me/messages?${listParams.toString()}`);
  const refs = Array.isArray(listed?.messages) ? listed.messages : [];
  const ids = refs
    .map((m) => String(m?.id || "").trim())
    .filter(Boolean)
    .slice(0, 5);

  const metaHeaderNames = ["Subject", "From", "To", "Date"];
  /** @type {GmailRecentUiMessage[]} */
  const out = [];

  for (const id of ids) {
    const mh = new URLSearchParams({ format: "metadata" });
    for (const h of metaHeaderNames) {
      mh.append("metadataHeaders", h);
    }
    const meta = await gmailAuthenticatedJson(
      "GET",
      `users/me/messages/${encodeURIComponent(id)}?${mh.toString()}`
    );
    const subject = getGmailMessageHeader(meta, "Subject").slice(0, 240) || "(No subject)";
    const from = getGmailMessageHeader(meta, "From").slice(0, 220);
    const snippet = String(meta?.snippet || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    const threadId = typeof meta?.threadId === "string" ? meta.threadId : undefined;
    const internalDate = typeof meta?.internalDate === "string" ? meta.internalDate : undefined;
    out.push({
      id,
      subject,
      from,
      snippet,
      ...(threadId ? { threadId } : {}),
      ...(internalDate ? { internalDate } : {})
    });
  }

  return { ok: true, messages: out };
}

/**
 * @param {string} message
 * @returns {boolean}
 */
function isOAuthCancelled(message) {
  return /canceled|cancelled|did not approve|access_denied|user denied|popup closed|user declined|authorization page could not be loaded/i.test(
    message
  );
}

/** Max characters from error response body included in thrown messages (helps diagnose TollGuru 403/quota/etc.). */
const MAX_HTTP_ERROR_DETAIL = 360;

function collectJsonErrorStrings(value, bucket, depth = 0) {
  if (depth > 4 || bucket.length >= 6 || value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t && !bucket.includes(t)) {
      bucket.push(t.slice(0, 500));
    }
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    bucket.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonErrorStrings(item, bucket, depth + 1);
      if (bucket.length >= 6) {
        break;
      }
    }
    return;
  }
  if (typeof value === "object") {
    for (const k of ["message", "error", "description", "detail", "reason", "title", "hint"]) {
      collectJsonErrorStrings(value[k], bucket, depth + 1);
    }
  }
}

/**
 * Turns a failed HTTP JSON/text body into a short single-line excerpt for diagnostics.
 *
 * @param {number} status
 * @param {string} rawText
 */
function formatFailedHttpDetail(status, rawText) {
  const trimmed = String(rawText || "").trim();
  let excerpt = "";
  if (!trimmed) {
    return `HTTP ${status}`;
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed.slice(0, 12000));
      const bucket = [];
      collectJsonErrorStrings(parsed, bucket);
      excerpt = bucket.join(" — ") || trimmed;
    } catch {
      excerpt = trimmed;
    }
  } else {
    excerpt = trimmed;
  }
  excerpt = excerpt.replace(/\s+/g, " ").trim();
  if (excerpt.length > MAX_HTTP_ERROR_DETAIL) {
    excerpt = `${excerpt.slice(0, MAX_HTTP_ERROR_DETAIL)}…`;
  }
  return `HTTP ${status}${excerpt ? `: ${excerpt}` : ""}`;
}

/**
 * @param {number} status
 * @param {Response} response
 */
async function readFailedFetchDetail(status, response) {
  const text = await response.text().catch(() => "");
  return formatFailedHttpDetail(status, text);
}

async function handleFetchJson(message) {
  const url = validateFetchUrl(message?.url);

  const method = String(message?.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) {
    throw new Error(`Unsupported method: ${method}`);
  }

  const headers = {
    Accept: "application/json",
    ...sanitizeFetchJsonHeaders(message?.headers, url.hostname)
  };
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
  const body =
    typeof message?.body === "string"
      ? message.body
      : message?.body !== null && message?.body !== undefined
      ? JSON.stringify(message.body)
      : undefined;
  if (method === "POST" && body && !hasContentType) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === "GET" ? undefined : body
  });

  if (!response.ok) {
    const detail = await readFailedFetchDetail(response.status, response);
    throw new Error(`Remote request failed (${response.status}) — ${detail}`);
  }

  return response.json();
}

const TOLLGURU_ORIGIN_DESTINATION_URL = "https://apis.tollguru.com/toll/v2/origin-destination-waypoints";

/**
 * Sanity-check TollGuru key using the OD endpoint only (matches extension toll fallback path behavior).
 *
 * @param {{ apiKey?: string }} message
 */
async function handleTestTollguru(message) {
  const apiKey = String(message?.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("Enter your TollGuru API key in the field.");
  }

  validateFetchUrl(TOLLGURU_ORIGIN_DESTINATION_URL);

  const response = await fetch(TOLLGURU_ORIGIN_DESTINATION_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      from: { address: "Chicago, IL" },
      to: { address: "Denver, CO" },
      serviceProvider: "tollguru",
      vehicle: { type: "5AxlesTruck" }
    })
  });

  if (!response.ok) {
    const detail = await readFailedFetchDetail(response.status, response);
    throw new Error(detail);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("TollGuru returned OK HTTP status but invalid JSON.");
  }

  const st = String(data?.status ?? "").trim().toUpperCase();
  if (st !== "OK") {
    const detail =
      typeof data?.message === "string" && data.message.trim()
        ? data.message.trim().replace(/\s+/g, " ")
        : typeof data?.error === "string" && data.error.trim()
          ? data.error.trim().replace(/\s+/g, " ")
          : `status ${JSON.stringify(data?.status ?? "")}`;
    throw new Error(`TollGuru API error (${detail.slice(0, 240)})`);
  }

  const routes = Array.isArray(data?.routes) ? data.routes.length : 0;
  return { okMessage: routes ? `TollGuru responded OK (${routes} route suggestion(s)). Truck profile: 5-axle.` : `TollGuru responded OK. Truck profile: 5-axle.` };
}
