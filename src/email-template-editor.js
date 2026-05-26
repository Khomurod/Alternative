import {
  DEFAULT_BOOKING_EMAIL_TEMPLATE,
  DEFAULT_OFFER_EMAIL_TEMPLATE,
  EMAIL_BOOKING_TEMPLATE_KEY,
  EMAIL_OFFER_TEMPLATE_KEY,
  EMAIL_TEMPLATE_PLACEHOLDERS,
  insertPlaceholderAtCursor,
  previewEmailTemplate
} from "./email-template.js";

/**
 * @param {{
 *   offerTextarea: HTMLTextAreaElement,
 *   bookingTextarea: HTMLTextAreaElement,
 *   offerPreviewEl: HTMLElement,
 *   bookingPreviewEl: HTMLElement,
 *   chipsRoot: HTMLElement
 * }} options
 */
export function initEmailTemplateEditor(options) {
  const { offerTextarea, bookingTextarea, offerPreviewEl, bookingPreviewEl, chipsRoot } = options;

  /** @type {HTMLTextAreaElement} */
  let activeTextarea = offerTextarea;

  function refreshPreviews() {
    offerPreviewEl.textContent = previewEmailTemplate(offerTextarea.value, DEFAULT_OFFER_EMAIL_TEMPLATE);
    bookingPreviewEl.textContent = previewEmailTemplate(bookingTextarea.value, DEFAULT_BOOKING_EMAIL_TEMPLATE);
  }

  offerTextarea.addEventListener("focusin", () => {
    activeTextarea = offerTextarea;
  });
  bookingTextarea.addEventListener("focusin", () => {
    activeTextarea = bookingTextarea;
  });

  offerTextarea.addEventListener("input", refreshPreviews);
  bookingTextarea.addEventListener("input", refreshPreviews);

  chipsRoot.replaceChildren();
  const group = document.createElement("div");
  group.className = "tpl-chips";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Insert placeholders");

  for (const { label, token } of EMAIL_TEMPLATE_PLACEHOLDERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tpl-chip";
    btn.textContent = label;
    btn.setAttribute("aria-label", `Insert ${label}`);
    btn.dataset.token = token;
    btn.addEventListener("click", () => {
      insertPlaceholderAtCursor(activeTextarea, token);
    });
    group.appendChild(btn);
  }

  chipsRoot.appendChild(group);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (changes[EMAIL_OFFER_TEMPLATE_KEY]) {
      offerTextarea.value = String(changes[EMAIL_OFFER_TEMPLATE_KEY].newValue ?? "");
    }
    if (changes[EMAIL_BOOKING_TEMPLATE_KEY]) {
      bookingTextarea.value = String(changes[EMAIL_BOOKING_TEMPLATE_KEY].newValue ?? "");
    }
    if (changes[EMAIL_OFFER_TEMPLATE_KEY] || changes[EMAIL_BOOKING_TEMPLATE_KEY]) {
      refreshPreviews();
    }
  });

  refreshPreviews();

  return { refreshPreviews };
}
