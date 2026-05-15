import { DAT_EXT_USER_ACCOUNT_EMAIL_KEY } from "./src/google-account.js";
import { validateFetchUrl } from "./src/fetch-url-guard.js";

const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

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

  if (message?.type === "dat-ext:fetch-json") {
    handleFetchJson(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || "Fetch failed") }));
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
 * @returns {Promise<{ ok: true, email: string } | { ok: false, cancelled?: boolean, error?: string }>}
 */
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

/**
 * @returns {Promise<string>}
 */
function getAuthTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
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
    ...(message?.headers && typeof message.headers === "object" ? message.headers : {})
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
