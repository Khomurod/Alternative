import { EMAIL_BOOKING_TEMPLATE_KEY, EMAIL_OFFER_TEMPLATE_KEY } from "./email-template.js";
import { DAT_EXT_NUMEO_COLUMN_KEY } from "./feature-flags.js";
import { DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY, DAT_EXT_TOLLGURU_API_KEY } from "./tollguru-api-key.js";

const offerEl = document.getElementById("offer-tpl");
const bookingEl = document.getElementById("booking-tpl");
const numeoEl = document.getElementById("numeo-column");
const tollguruEl = document.getElementById("tollguru-key");
const googleFallbackEl = document.getElementById("google-toll-fallback");
const testTollguruBtn = document.getElementById("test-tollguru");
const save = document.getElementById("save");
const msg = document.getElementById("msg");

chrome.storage.local.get(
  [
    EMAIL_OFFER_TEMPLATE_KEY,
    EMAIL_BOOKING_TEMPLATE_KEY,
    DAT_EXT_NUMEO_COLUMN_KEY,
    DAT_EXT_TOLLGURU_API_KEY,
    DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY
  ],
  (r) => {
    offerEl.value = r[EMAIL_OFFER_TEMPLATE_KEY] ?? "";
    bookingEl.value = r[EMAIL_BOOKING_TEMPLATE_KEY] ?? "";
    numeoEl.checked = r[DAT_EXT_NUMEO_COLUMN_KEY] !== false;
    tollguruEl.value = r[DAT_EXT_TOLLGURU_API_KEY] ?? "";
    googleFallbackEl.checked = r[DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY] !== false;
  }
);

save.addEventListener("click", () => {
  msg.className = "";
  msg.style.color = "";

  chrome.storage.local.set(
    {
      [EMAIL_OFFER_TEMPLATE_KEY]: offerEl.value,
      [EMAIL_BOOKING_TEMPLATE_KEY]: bookingEl.value,
      [DAT_EXT_NUMEO_COLUMN_KEY]: Boolean(numeoEl.checked),
      [DAT_EXT_TOLLGURU_API_KEY]: String(tollguruEl.value || "").trim(),
      [DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY]: Boolean(googleFallbackEl.checked)
    },
    () => {
      msg.textContent = "Saved.";
      msg.style.color = "#15803d";
      setTimeout(() => {
        msg.textContent = "";
        msg.style.color = "";
      }, 2200);
    }
  );
});

testTollguruBtn.addEventListener("click", () => {
  msg.className = "";
  msg.style.color = "";

  const apiKey = String(tollguruEl.value || "").trim();
  if (!apiKey) {
    msg.textContent = "Enter your TollGuru API key, then run the test.";
    msg.className = "msg--error";
    msg.style.color = "#b42318";
    return;
  }

  msg.textContent = "Testing TollGuru…";

  chrome.runtime.sendMessage({ type: "dat-ext:test-tollguru", apiKey }, (response) => {
    if (chrome.runtime.lastError) {
      msg.textContent = String(chrome.runtime.lastError.message || "Message to background failed");
      msg.className = "msg--error";
      msg.style.color = "#b42318";
      return;
    }
    if (!response?.ok) {
      msg.textContent = String(response?.error || "TollGuru test failed");
      msg.className = "msg--error";
      msg.style.color = "#b42318";
      return;
    }

    msg.textContent = String(response.okMessage || "TollGuru OK");
    msg.style.color = "#15803d";
  });
});
