import { EMAIL_BOOKING_TEMPLATE_KEY, EMAIL_OFFER_TEMPLATE_KEY } from "./email-template.js";
import { initEmailTemplateEditor } from "./email-template-editor.js";
import { DAT_EXT_NUMEO_COLUMN_KEY } from "./feature-flags.js";
import { DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY } from "./email-settings.js";
import { DAT_EXT_USER_ACCOUNT_EMAIL_KEY } from "./google-account.js";
import { DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY, DAT_EXT_TOLLGURU_API_KEY } from "./tollguru-api-key.js";

const offerEl = document.getElementById("offer-tpl");
const bookingEl = document.getElementById("booking-tpl");
const offerPreviewEl = document.getElementById("offer-preview");
const bookingPreviewEl = document.getElementById("booking-preview");
const tplChipsHost = document.getElementById("tpl-chips-host");

const emailTemplateEditor =
  offerEl && bookingEl && offerPreviewEl && bookingPreviewEl && tplChipsHost
    ? initEmailTemplateEditor({
        offerTextarea: offerEl,
        bookingTextarea: bookingEl,
        offerPreviewEl,
        bookingPreviewEl,
        chipsRoot: tplChipsHost
      })
    : null;
const numeoEl = document.getElementById("numeo-column");
const emailIncludeSnapshotEl = document.getElementById("email-include-snapshot");
const tollguruEl = document.getElementById("tollguru-key");
const googleFallbackEl = document.getElementById("google-toll-fallback");
const testTollguruBtn = document.getElementById("test-tollguru");
const save = document.getElementById("save");
const msg = document.getElementById("msg");
const googleAccountEmailSpan = document.getElementById("google-account-email");
const disconnectGoogleBtn = document.getElementById("disconnect-google");

function refreshGoogleAccountLabel() {
  if (!googleAccountEmailSpan) {
    return;
  }
  chrome.storage.local.get([DAT_EXT_USER_ACCOUNT_EMAIL_KEY], (r) => {
    const em = String(r[DAT_EXT_USER_ACCOUNT_EMAIL_KEY] || "").trim();
    googleAccountEmailSpan.textContent = em || "(not connected — open Side Panel from DAT or the toolbar icon)";
  });
}

refreshGoogleAccountLabel();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[DAT_EXT_USER_ACCOUNT_EMAIL_KEY]) {
    refreshGoogleAccountLabel();
  }
});

disconnectGoogleBtn?.addEventListener("click", () => {
  msg.className = "";
  msg.style.color = "";

  chrome.runtime.sendMessage({ type: "dat-ext:google-logout" }, (response) => {
    if (chrome.runtime.lastError) {
      msg.textContent = String(chrome.runtime.lastError.message || "Disconnect failed");
      msg.className = "msg--error";
      msg.style.color = "#b42318";
      return;
    }
    if (!response?.ok) {
      msg.textContent = String(response?.error || "Disconnect failed");
      msg.className = "msg--error";
      msg.style.color = "#b42318";
      return;
    }
    msg.textContent = "Disconnected. Reload DAT tabs if needed.";
    msg.style.color = "#15803d";
    refreshGoogleAccountLabel();
    setTimeout(() => {
      msg.textContent = "";
      msg.style.color = "";
    }, 2800);
  });
});

chrome.storage.local.get(
  [
    EMAIL_OFFER_TEMPLATE_KEY,
    EMAIL_BOOKING_TEMPLATE_KEY,
    DAT_EXT_NUMEO_COLUMN_KEY,
    DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY,
    DAT_EXT_TOLLGURU_API_KEY,
    DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY
  ],
  (r) => {
    offerEl.value = r[EMAIL_OFFER_TEMPLATE_KEY] ?? "";
    bookingEl.value = r[EMAIL_BOOKING_TEMPLATE_KEY] ?? "";
    emailTemplateEditor?.refreshPreviews();
    numeoEl.checked = r[DAT_EXT_NUMEO_COLUMN_KEY] !== false;
    emailIncludeSnapshotEl.checked = r[DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY] === true;
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
      [DAT_EXT_EMAIL_INCLUDE_SNAPSHOT_KEY]: Boolean(emailIncludeSnapshotEl?.checked),
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
