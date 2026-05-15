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
    throw new Error(`Remote request failed (${response.status})`);
  }

  return response.json();
}
