import { validateFetchUrl } from "./src/fetch-url-guard.js";

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

  if (message?.type === "dat-ext:fetch-json") {
    handleFetchJson(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || "Fetch failed") }));
    return true;
  }
});

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
