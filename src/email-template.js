/** Keep keys in sync with `src/popup-entry.js` and `popup.html` help text. */
export const EMAIL_OFFER_TEMPLATE_KEY = "dat-ext-email-offer-template-v1";
export const EMAIL_BOOKING_TEMPLATE_KEY = "dat-ext-email-booking-template-v1";

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
