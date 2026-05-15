/**
 * Gmail compose via web URL (no OAuth). Falls back to mailto when the URL is too long.
 */

/** Conservative limit for GET compose URLs across browsers and proxies. */
export const GMAIL_COMPOSE_URL_MAX_LENGTH = 1900;

export function buildMailtoUrl(to, subject, body) {
  const email = String(to ?? "").trim();
  const params = new URLSearchParams({ subject: String(subject ?? ""), body: String(body ?? "") });
  return `mailto:${email}?${params.toString()}`;
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} body
 * @param {{ userAccountEmail?: string }} [options]
 * @returns {string}
 */
export function buildGmailComposeUrl(to, subject, body, options = {}) {
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  const addr = String(to ?? "").trim();
  if (addr) {
    url.searchParams.set("to", addr);
  }
  url.searchParams.set("su", String(subject ?? ""));
  url.searchParams.set("body", String(body ?? ""));

  const sender = String(options.userAccountEmail ?? "").trim();
  if (sender) {
    url.searchParams.set("authuser", sender);
  }

  return url.toString();
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} body
 * @param {{ maxLength?: number, userAccountEmail?: string }} [options]
 * @returns {{ href: string, usedGmail: boolean }}
 */
export function pickGmailComposeOrMailto(to, subject, body, options = {}) {
  const maxLength = options.maxLength ?? GMAIL_COMPOSE_URL_MAX_LENGTH;
  const gmail = buildGmailComposeUrl(to, subject, body, {
    userAccountEmail: options.userAccountEmail
  });
  if (gmail.length <= maxLength) {
    return { href: gmail, usedGmail: true };
  }
  return { href: buildMailtoUrl(to, subject, body), usedGmail: false };
}
