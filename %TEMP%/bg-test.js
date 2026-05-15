// src/google-account.js
var DAT_EXT_USER_ACCOUNT_EMAIL_KEY = "datExtUserAccountEmail";

// src/fetch-url-guard.js
var ALLOWED_FETCH_HOSTNAMES = [
  "gmail.googleapis.com",
  "apis.tollguru.com",
  "maps.googleapis.com",
  "routes.googleapis.com",
  "photon.komoot.io",
  "router.project-osrm.org",
  "nominatim.openstreetmap.org",
  "tile.openstreetmap.org"
];
var ALLOWED_HOSTNAME_SET = new Set(ALLOWED_FETCH_HOSTNAMES);
function validateFetchUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (!ALLOWED_HOSTNAME_SET.has(url.hostname)) {
    throw new Error("Security Error: Unauthorized domain access attempt.");
  }
  return url;
}

// src/gmail-send.js
var TO_MAX = 254;
var SUBJECT_MAX = 200;
var BODY_MAX = 5e5;
function utf8ToStandardBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
function base64UrlFromUtf8(str) {
  return utf8ToStandardBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function encodeMimeSubject(subject) {
  const s = subject.replace(/\r?\n/g, " ").trim();
  if (!/[^\u0000-\u007f]/.test(s)) {
    return s;
  }
  return `=?UTF-8?B?${utf8ToStandardBase64(s)}?=`;
}
function foldBase64Lines(b64) {
  return b64.replace(/.{1,76}/g, (chunk) => `${chunk}\r
`).replace(/\r\n$/, "");
}
function validateGmailSendPayload(message) {
  const to = String(message?.to ?? "").trim().slice(0, TO_MAX);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Invalid or missing recipient email.");
  }
  const subject = String(message?.subject ?? "").trim().slice(0, SUBJECT_MAX);
  if (!subject) {
    throw new Error("Subject is required.");
  }
  const body = String(message?.body ?? "");
  if (body.length > BODY_MAX) {
    throw new Error("Email body is too large.");
  }
  return { to, subject, body };
}
function buildGmailApiRaw(parts) {
  const { to, subject, body } = parts;
  const body64 = foldBase64Lines(utf8ToStandardBase64(body));
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body64
  ].join("\r\n") + "\r\n";
  return base64UrlFromUtf8(mime);
}
function snippetForLogs(body, max = 80) {
  const t = String(body || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "(empty)";
  return `${t.slice(0, max)}\u2026`;
}

// background.js
var GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
var GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
chrome.runtime.onInstalled.addListener((details) => {
  console.info("[DAT Dispatcher Assist] Extension installed:", details.reason);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "my-ext:ping") {
    sendResponse({
      ok: true,
      tabId: sender.tab?.id ?? null
    });
    return;
  }
  if (message?.type === "dat-ext:google-login") {
    handleGoogleLogin().then((result) => sendResponse(result)).catch(
      (error) => sendResponse({
        ok: false,
        cancelled: false,
        error: String(error?.message || error || "Google login failed")
      })
    );
    return true;
  }
  if (message?.type === "dat-ext:fetch-json") {
    handleFetchJson(message).then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error || "Fetch failed") }));
    return true;
  }
  if (message?.type === "dat-ext:gmail-send") {
    handleGmailSend(message).then((result) => sendResponse(result)).catch((error) => {
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
    handleGmailThreadsList(message).then((result) => sendResponse(result)).catch((error) => {
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
    handleGmailRecentMessages(message).then((result) => sendResponse(result)).catch((error) => {
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
    handleTestTollguru(message).then((result) => sendResponse({ ok: true, ...result })).catch(
      (error) => sendResponse({
        ok: false,
        error: String(error?.message || error || "TollGuru test failed")
      })
    );
    return true;
  }
});
async function handleGoogleLogin() {
  try {
    const token = await getAuthTokenInteractive();
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
  } catch (error) {
    const message = String(error?.message || error || "Google login failed");
    if (isOAuthCancelled(message)) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, error: message };
  }
}
function getAuthTokenInteractive() {
  return getAuthToken({ interactive: true });
}
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
function removeCachedToken(token) {
  return new Promise((resolve) => {
    if (!token) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}
async function handleGmailSend(message) {
  const { to, subject, body } = validateGmailSendPayload(message);
  const raw = buildGmailApiRaw({ to, subject, body });
  console.info("[DAT Dispatcher Assist] Gmail send:", {
    to,
    subjectLen: subject.length,
    bodySnippet: snippetForLogs(body)
  });
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
  const id = typeof data?.id === "string" ? data.id : void 0;
  return { ok: true, id };
}
var GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/";
async function gmailAuthenticatedJson(method, pathAndQuery) {
  const urlStr = `${GMAIL_API_BASE}${pathAndQuery}`;
  validateFetchUrl(urlStr);
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
function sanitizeThreadsForUi(data) {
  const threads = Array.isArray(data?.threads) ? data.threads : [];
  const out = [];
  for (const t of threads) {
    const id = typeof t?.id === "string" ? t.id.trim() : "";
    if (!id) {
      continue;
    }
    const snippet = typeof t?.snippet === "string" ? t.snippet.replace(/\s+/g, " ").trim().slice(0, 280) : "";
    const historyId = typeof t?.historyId === "string" ? t.historyId : void 0;
    out.push({ id, snippet, ...historyId ? { historyId } : {} });
  }
  return out;
}
async function handleGmailThreadsList(message) {
  const maxRaw = Number(message?.maxResults);
  const maxResults = Math.min(25, Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 10));
  const contactEmail = String(message?.contactEmail || "").trim().slice(0, 254);
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
  const estimate = typeof data?.resultSizeEstimate === "number" && Number.isFinite(data.resultSizeEstimate) ? data.resultSizeEstimate : void 0;
  return { ok: true, threads, ...estimate !== void 0 ? { resultSizeEstimate: estimate } : {} };
}
function getGmailMessageHeader(msg, headerName) {
  const headers = msg?.payload?.headers;
  if (!Array.isArray(headers)) {
    return "";
  }
  const needle = String(headerName || "").trim().toLowerCase();
  const hit = headers.find((h) => String(h?.name || "").trim().toLowerCase() === needle);
  return typeof hit?.value === "string" ? hit.value.trim() : "";
}
async function handleGmailRecentMessages(message) {
  const contactEmail = String(message?.contactEmail || "").trim().slice(0, 254);
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
  const ids = refs.map((m) => String(m?.id || "").trim()).filter(Boolean).slice(0, 5);
  const metaHeaderNames = ["Subject", "From", "To", "Date"];
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
    const snippet = String(meta?.snippet || "").replace(/\s+/g, " ").trim().slice(0, 280);
    const threadId = typeof meta?.threadId === "string" ? meta.threadId : void 0;
    const internalDate = typeof meta?.internalDate === "string" ? meta.internalDate : void 0;
    out.push({
      id,
      subject,
      from,
      snippet,
      ...threadId ? { threadId } : {},
      ...internalDate ? { internalDate } : {}
    });
  }
  return { ok: true, messages: out };
}
function isOAuthCancelled(message) {
  return /canceled|cancelled|did not approve|access_denied|user denied|popup closed|user declined|authorization page could not be loaded/i.test(
    message
  );
}
var MAX_HTTP_ERROR_DETAIL = 360;
function collectJsonErrorStrings(value, bucket, depth = 0) {
  if (depth > 4 || bucket.length >= 6 || value === null || value === void 0) {
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
function formatFailedHttpDetail(status, rawText) {
  const trimmed = String(rawText || "").trim();
  let excerpt = "";
  if (!trimmed) {
    return `HTTP ${status}`;
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed.slice(0, 12e3));
      const bucket = [];
      collectJsonErrorStrings(parsed, bucket);
      excerpt = bucket.join(" \u2014 ") || trimmed;
    } catch {
      excerpt = trimmed;
    }
  } else {
    excerpt = trimmed;
  }
  excerpt = excerpt.replace(/\s+/g, " ").trim();
  if (excerpt.length > MAX_HTTP_ERROR_DETAIL) {
    excerpt = `${excerpt.slice(0, MAX_HTTP_ERROR_DETAIL)}\u2026`;
  }
  return `HTTP ${status}${excerpt ? `: ${excerpt}` : ""}`;
}
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
    ...message?.headers && typeof message.headers === "object" ? message.headers : {}
  };
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
  const body = typeof message?.body === "string" ? message.body : message?.body !== null && message?.body !== void 0 ? JSON.stringify(message.body) : void 0;
  if (method === "POST" && body && !hasContentType) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === "GET" ? void 0 : body
  });
  if (!response.ok) {
    const detail = await readFailedFetchDetail(response.status, response);
    throw new Error(`Remote request failed (${response.status}) \u2014 ${detail}`);
  }
  return response.json();
}
var TOLLGURU_ORIGIN_DESTINATION_URL = "https://apis.tollguru.com/toll/v2/origin-destination-waypoints";
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
    const detail = typeof data?.message === "string" && data.message.trim() ? data.message.trim().replace(/\s+/g, " ") : typeof data?.error === "string" && data.error.trim() ? data.error.trim().replace(/\s+/g, " ") : `status ${JSON.stringify(data?.status ?? "")}`;
    throw new Error(`TollGuru API error (${detail.slice(0, 240)})`);
  }
  const routes = Array.isArray(data?.routes) ? data.routes.length : 0;
  return { okMessage: routes ? `TollGuru responded OK (${routes} route suggestion(s)). Truck profile: 5-axle.` : `TollGuru responded OK. Truck profile: 5-axle.` };
}
