/** Pure helpers for Gmail API `users.messages.send` (RFC 5322–lite + base64url). */

const TO_MAX = 254;
const SUBJECT_MAX = 200;
const BODY_MAX = 500_000;

/**
 * @param {string} str
 * @returns {string} Standard Base64
 */
function utf8ToStandardBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/**
 * @param {string} str
 * @returns {string} URL-safe Base64 (no padding) for Gmail `raw`
 */
function base64UrlFromUtf8(str) {
  return utf8ToStandardBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} subject
 */
function encodeMimeSubject(subject) {
  const s = subject.replace(/\r?\n/g, " ").trim();
  if (!/[^\u0000-\u007f]/.test(s)) {
    return s;
  }
  return `=?UTF-8?B?${utf8ToStandardBase64(s)}?=`;
}

/**
 * @param {string} b64
 */
function foldBase64Lines(b64) {
  return b64.replace(/.{1,76}/g, (chunk) => `${chunk}\r\n`).replace(/\r\n$/, "");
}

/**
 * @param {*} message
 * @returns {{ to: string, subject: string, body: string }}
 */
export function validateGmailSendPayload(message) {
  const to = String(message?.to ?? "")
    .trim()
    .slice(0, TO_MAX);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Invalid or missing recipient email.");
  }

  const subject = String(message?.subject ?? "")
    .trim()
    .slice(0, SUBJECT_MAX);
  if (!subject) {
    throw new Error("Subject is required.");
  }

  const body = String(message?.body ?? "");
  if (body.length > BODY_MAX) {
    throw new Error("Email body is too large.");
  }

  return { to, subject, body };
}

/**
 * @param {{ to: string, subject: string, body: string }} parts
 * @returns {string} Gmail `raw` field (URL-safe base64 of full MIME message)
 */
export function buildGmailApiRaw(parts) {
  const { to, subject, body } = parts;
  const body64 = foldBase64Lines(utf8ToStandardBase64(body));

  const mime =
    [
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

/**
 * Snippet-safe excerpt for logs (never the full body).
 *
 * @param {string} body
 */
export function snippetForLogs(body, max = 80) {
  const t = String(body || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "(empty)";
  return `${t.slice(0, max)}…`;
}
