/** Keep keys in sync with `src/popup-entry.js` and `popup.html` help text. */
export const EMAIL_OFFER_TEMPLATE_KEY = "dat-ext-email-offer-template-v1";
export const EMAIL_BOOKING_TEMPLATE_KEY = "dat-ext-email-booking-template-v1";

export const DEFAULT_OFFER_EMAIL_TEMPLATE = `Hello {{company}},

I am reaching out regarding the load from {{origin}} to {{destination}}. Is this still available?

Thank you.`;

export const DEFAULT_BOOKING_EMAIL_TEMPLATE = `Hello {{company}},

I would like to discuss booking the load from {{origin}} to {{destination}}.

Thank you.`;

/** Sample values for settings preview (not used on DAT). */
export const EMAIL_TEMPLATE_PREVIEW_VARS = {
  origin: "Chicago, IL",
  destination: "Dallas, TX",
  companyName: "Example Broker LLC",
  contactEmail: "dispatcher@example.com"
};

/** @type {{ label: string, token: string }[]} */
export const EMAIL_TEMPLATE_PLACEHOLDERS = [
  { label: "Pick up location", token: "{{origin}}" },
  { label: "Delivery location", token: "{{destination}}" },
  { label: "Company", token: "{{company}}" },
  { label: "Contact email", token: "{{email}}" }
];

/**
 * @param {string|null|undefined} template
 * @param {{ origin?: string, destination?: string, companyName?: string, contactEmail?: string }} vars
 * @returns {string|null} null if template empty so caller can use default copy
 */
export function interpolateEmailTemplate(template, vars) {
  const raw = String(template ?? "").trim();
  if (!raw) {
    return null;
  }

  const origin = vars.origin ?? "";
  const destination = vars.destination ?? "";
  const company = vars.companyName ?? "";
  const email = vars.contactEmail ?? "";

  return raw
    .replaceAll("{{origin}}", origin)
    .replaceAll("{{destination}}", destination)
    .replaceAll("{{company}}", company)
    .replaceAll("{{email}}", email);
}

/**
 * @param {string|null|undefined} savedTemplate
 * @param {string} defaultTemplate
 * @param {{ origin?: string, destination?: string, companyName?: string, contactEmail?: string }} [vars]
 * @returns {string}
 */
export function previewEmailTemplate(savedTemplate, defaultTemplate, vars = EMAIL_TEMPLATE_PREVIEW_VARS) {
  const effective = String(savedTemplate ?? "").trim() || defaultTemplate;
  return interpolateEmailTemplate(effective, vars) ?? "";
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {string} token
 */
export function insertPlaceholderAtCursor(textarea, token) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const value = textarea.value;

  if (typeof textarea.setRangeText === "function") {
    textarea.setRangeText(token, start, end, "end");
  } else {
    textarea.value = value.slice(0, start) + token + value.slice(end);
    const pos = start + token.length;
    textarea.setSelectionRange(pos, pos);
  }

  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
