import { EMAIL_BOOKING_TEMPLATE_KEY, EMAIL_OFFER_TEMPLATE_KEY } from "./email-template.js";
import { DAT_EXT_NUMEO_COLUMN_KEY } from "./feature-flags.js";
import { DAT_EXT_TOLLGURU_API_KEY } from "./tollguru-api-key.js";

const offerEl = document.getElementById("offer-tpl");
const bookingEl = document.getElementById("booking-tpl");
const numeoEl = document.getElementById("numeo-column");
const tollguruEl = document.getElementById("tollguru-key");
const save = document.getElementById("save");
const msg = document.getElementById("msg");

chrome.storage.local.get(
  [EMAIL_OFFER_TEMPLATE_KEY, EMAIL_BOOKING_TEMPLATE_KEY, DAT_EXT_NUMEO_COLUMN_KEY, DAT_EXT_TOLLGURU_API_KEY],
  (r) => {
    offerEl.value = r[EMAIL_OFFER_TEMPLATE_KEY] ?? "";
    bookingEl.value = r[EMAIL_BOOKING_TEMPLATE_KEY] ?? "";
    numeoEl.checked = r[DAT_EXT_NUMEO_COLUMN_KEY] !== false;
    tollguruEl.value = r[DAT_EXT_TOLLGURU_API_KEY] ?? "";
  }
);

save.addEventListener("click", () => {
  chrome.storage.local.set(
    {
      [EMAIL_OFFER_TEMPLATE_KEY]: offerEl.value,
      [EMAIL_BOOKING_TEMPLATE_KEY]: bookingEl.value,
      [DAT_EXT_NUMEO_COLUMN_KEY]: Boolean(numeoEl.checked),
      [DAT_EXT_TOLLGURU_API_KEY]: String(tollguruEl.value || "").trim()
    },
    () => {
      msg.textContent = "Saved.";
      setTimeout(() => {
        msg.textContent = "";
      }, 2000);
    }
  );
});
